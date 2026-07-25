// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MerchantRegistry} from "./MerchantRegistry.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title SettlementPool (Troia — built on Arc)
/// @notice Cross-border settlement köprüsü — USDC likidite havuzu (Arc).
///         Kullanıcı TL öder (PSP, off-chain) → havuz merchant'a ANINDA net USDC gönderir
///         → T+n blokaj çözülünce havuz off-chain geri fonlanır (Paribu/OTC + CCTP).
/// @dev MODEL A: `settle` ham adres almaz — `merchantId` alır ve ödeme adresini
///      MerchantRegistry'den çözer. Böylece yalnız kayıtlı, doğrulanmış merchant'lar
///      ödenir; checkout sayfası keyfi bir adres enjekte edemez.
contract SettlementPool {
    address public owner;
    address public pendingOwner; // iki adımlı devir
    IERC20 public immutable usdc; // Arc USDC (6 decimals)
    MerchantRegistry public immutable registry;

    bool public paused; // acil durdurma
    uint256 public maxSettleAmount; // tek işlem üst sınırı (devre kesici)

    uint256 public totalSettled;
    uint256 public settlementCount;

    uint256 private constant BPS_MAX = 10_000; // %100
    uint256 private constant VALOR_MAX = 365;
    uint256 private _lock = 1; // reentrancy kilidi

    struct Settlement {
        bytes32 merchantId;
        address payout;
        uint256 grossTL; // kuruş
        uint256 commissionBps;
        uint256 valorDays;
        uint256 usdcOut; // 6 decimals
        uint256 timestamp;
    }

    mapping(bytes32 posRef => Settlement) public settlements;
    mapping(bytes32 posRef => bool) public isSettled;

    event Settled(
        bytes32 indexed posRef,
        bytes32 indexed merchantId,
        address indexed payout,
        uint256 grossTL,
        uint256 commissionBps,
        uint256 valorDays,
        uint256 usdcOut
    );
    event PoolFunded(address indexed from, uint256 amount);
    event PoolWithdrawn(address indexed to, uint256 amount);
    event Paused(bool state);
    event MaxSettleUpdated(uint256 amount);
    event OwnershipTransferStarted(address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error IsPaused();
    error ZeroAddress();
    error AlreadySettled();
    error MerchantNotActive();
    error BadAmount();
    error BadCommission();
    error BadValor();
    error OverMaxSettle();
    error PoolInsufficient();
    error Reentrancy();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    modifier notPaused() {
        if (paused) revert IsPaused();
        _;
    }
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address _usdc, address _registry, uint256 _maxSettleAmount) {
        if (_usdc == address(0) || _registry == address(0)) revert ZeroAddress();
        if (_maxSettleAmount == 0) revert BadAmount();
        owner = msg.sender;
        usdc = IERC20(_usdc);
        registry = MerchantRegistry(_registry);
        maxSettleAmount = _maxSettleAmount;
    }

    // ---- yönetim ----
    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        pendingOwner = to;
        emit OwnershipTransferStarted(to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setPaused(bool state) external onlyOwner {
        paused = state;
        emit Paused(state);
    }

    function setMaxSettleAmount(uint256 amount) external onlyOwner {
        if (amount == 0) revert BadAmount();
        maxSettleAmount = amount;
        emit MaxSettleUpdated(amount);
    }

    // ---- havuz ----
    function fundPool(uint256 amount) external onlyOwner {
        if (amount == 0) revert BadAmount();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit PoolFunded(msg.sender, amount);
    }

    function withdrawPool(uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (!usdc.transfer(to, amount)) revert TransferFailed();
        emit PoolWithdrawn(to, amount);
    }

    // ---- settlement (Model A: merchantId → registry → payout) ----

    /// @notice Bir POS ödemesini settle eder. Ödeme adresi merchantId'den registry ile çözülür.
    /// @param posRef Benzersiz ödeme referansı (çift-settle koruması)
    /// @param merchantId Kayıtlı merchant kimliği (ham adres DEĞİL)
    /// @param grossTL Brüt TL (kuruş)
    /// @param commissionBps Komisyon (bps, ≤ %100)
    /// @param valorDays Valör günü (1–365)
    /// @param usdcOut Merchant'a gidecek net USDC (6 decimals)
    function settle(
        bytes32 posRef,
        bytes32 merchantId,
        uint256 grossTL,
        uint256 commissionBps,
        uint256 valorDays,
        uint256 usdcOut
    ) external onlyOwner notPaused nonReentrant {
        if (isSettled[posRef]) revert AlreadySettled();

        (address payout, bool active) = registry.resolve(merchantId);
        if (payout == address(0) || !active) revert MerchantNotActive();

        if (grossTL == 0) revert BadAmount();
        if (commissionBps > BPS_MAX) revert BadCommission();
        if (valorDays == 0 || valorDays > VALOR_MAX) revert BadValor();
        if (usdcOut == 0) revert BadAmount();
        if (usdcOut > maxSettleAmount) revert OverMaxSettle();
        if (usdc.balanceOf(address(this)) < usdcOut) revert PoolInsufficient();

        isSettled[posRef] = true;
        settlements[posRef] =
            Settlement(merchantId, payout, grossTL, commissionBps, valorDays, usdcOut, block.timestamp);
        totalSettled += usdcOut;
        settlementCount += 1;

        if (!usdc.transfer(payout, usdcOut)) revert TransferFailed();
        emit Settled(posRef, merchantId, payout, grossTL, commissionBps, valorDays, usdcOut);
    }

    function poolBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
