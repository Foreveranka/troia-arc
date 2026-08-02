// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title MerchantRegistry
/// @notice Model A çekirdeği: merchantId → DOĞRULANMIŞ settlement adresi eşlemesi.
///         Merchant onboarding'de platform (owner) kaydeder; ödeme adresi burada,
///         checkout sayfasında DEĞİL. Böylece kötü/hack'lenmiş bir sayfa keyfi bir
///         ödeme adresi enjekte edemez, SettlementPool her zaman buradan çözer.
/// @dev Onboarding'de merchant için bir Circle dev-controlled cüzdan açılır ve
///      onun adresi `payout` olarak yazılır (off-chain), kayıt on-chain kanıt olur.
contract MerchantRegistry {
    address public owner;
    address public pendingOwner; // iki adımlı devir (key kaybına karşı)

    struct Merchant {
        address payout; // settlement adresi (ör. Circle Wallet)
        bool active; // onboarding tamamsa ve askıya alınmadıysa true
        uint64 registeredAt;
    }

    mapping(bytes32 merchantId => Merchant) public merchants;
    uint256 public merchantCount;

    event MerchantRegistered(bytes32 indexed merchantId, address indexed payout);
    event MerchantPayoutUpdated(bytes32 indexed merchantId, address indexed payout);
    event MerchantActiveSet(bytes32 indexed merchantId, bool active);
    event OwnershipTransferStarted(address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error ZeroAddress();
    error AlreadyRegistered();
    error NotRegistered();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
    }

    // ---- onboarding ----

    /// @notice Yeni merchant kaydı (onboarding). merchantId = keccak256(merchant slug/uuid).
    function registerMerchant(bytes32 merchantId, address payout) external onlyOwner {
        if (payout == address(0)) revert ZeroAddress();
        Merchant storage m = merchants[merchantId];
        if (m.payout != address(0)) revert AlreadyRegistered();
        m.payout = payout;
        m.active = true;
        m.registeredAt = uint64(block.timestamp);
        merchantCount += 1;
        emit MerchantRegistered(merchantId, payout);
    }

    /// @notice Merchant ödeme adresini günceller (ör. cüzdan rotasyonu).
    function updatePayout(bytes32 merchantId, address payout) external onlyOwner {
        if (payout == address(0)) revert ZeroAddress();
        Merchant storage m = merchants[merchantId];
        if (m.payout == address(0)) revert NotRegistered();
        m.payout = payout;
        emit MerchantPayoutUpdated(merchantId, payout);
    }

    /// @notice Merchant'ı askıya al / tekrar aktifleştir.
    function setActive(bytes32 merchantId, bool active) external onlyOwner {
        Merchant storage m = merchants[merchantId];
        if (m.payout == address(0)) revert NotRegistered();
        m.active = active;
        emit MerchantActiveSet(merchantId, active);
    }

    // ---- çözümleme (SettlementPool bunu kullanır) ----

    /// @notice merchantId → (payout, active). Kayıtlı değilse payout = address(0).
    function resolve(bytes32 merchantId) external view returns (address payout, bool active) {
        Merchant storage m = merchants[merchantId];
        return (m.payout, m.active);
    }

    function isActive(bytes32 merchantId) external view returns (bool) {
        return merchants[merchantId].active;
    }

    // ---- iki adımlı ownership ----

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
}
