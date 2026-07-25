// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {SettlementPool} from "../src/SettlementPool.sol";

contract TroiaTest is Test {
    MockUSDC usdc;
    MerchantRegistry registry;
    SettlementPool pool;

    address platform = makeAddr("platform"); // owner (operatör)
    address merchantWallet = makeAddr("merchantWallet"); // ör. Circle Wallet
    address attacker = makeAddr("attacker");

    bytes32 constant M1 = keccak256("merchant.acme");
    uint256 constant U = 1e6; // 1 USDC (6 hane)
    uint256 constant MAX_SETTLE = 10_000 * 1e6; // 10.000 USDC devre kesici

    function setUp() public {
        vm.startPrank(platform);
        usdc = new MockUSDC();
        registry = new MerchantRegistry(platform);
        pool = new SettlementPool(address(usdc), address(registry), MAX_SETTLE);
        // havuzu fonla
        usdc.mint(platform, 1_000_000 * U);
        usdc.approve(address(pool), type(uint256).max);
        pool.fundPool(500_000 * U);
        vm.stopPrank();
    }

    function _register(bytes32 id, address payout) internal {
        vm.prank(platform);
        registry.registerMerchant(id, payout);
    }

    function _settle(bytes32 posRef, bytes32 id, uint256 usdcOut) internal {
        vm.prank(platform);
        pool.settle(posRef, id, 100_000 * 100, 66, 1, usdcOut); // grossTL=100.000₺(kuruş), %0.66, T+1
    }

    // --- Model A çekirdeği: kayıtlı merchant'a ödeme ---
    function test_Settle_PaysRegisteredMerchant() public {
        _register(M1, merchantWallet);
        uint256 before = usdc.balanceOf(merchantWallet);
        _settle(keccak256("pos-1"), M1, 99 * U);
        assertEq(usdc.balanceOf(merchantWallet) - before, 99 * U, "merchant net USDC almali");
        assertEq(pool.settlementCount(), 1);
        assertEq(pool.totalSettled(), 99 * U);
    }

    // --- kayıtsız merchantId → ödeme YOK (sayfa keyfi adres enjekte edemez) ---
    function test_Settle_RejectsUnregisteredMerchant() public {
        vm.prank(platform);
        vm.expectRevert(SettlementPool.MerchantNotActive.selector);
        pool.settle(keccak256("pos-x"), keccak256("unknown"), 100_000 * 100, 66, 1, 50 * U);
    }

    // --- askıya alınmış merchant → ödeme YOK ---
    function test_Settle_RejectsInactiveMerchant() public {
        _register(M1, merchantWallet);
        vm.prank(platform);
        registry.setActive(M1, false);
        vm.prank(platform);
        vm.expectRevert(SettlementPool.MerchantNotActive.selector);
        pool.settle(keccak256("pos-2"), M1, 100_000 * 100, 66, 1, 50 * U);
    }

    // --- çift-settle engeli ---
    function test_Settle_RejectsDoubleSettle() public {
        _register(M1, merchantWallet);
        _settle(keccak256("pos-3"), M1, 40 * U);
        vm.prank(platform);
        vm.expectRevert(SettlementPool.AlreadySettled.selector);
        pool.settle(keccak256("pos-3"), M1, 100_000 * 100, 66, 1, 40 * U);
    }

    // --- devre kesici (maxSettleAmount) ---
    function test_Settle_RejectsOverMaxSettle() public {
        _register(M1, merchantWallet);
        vm.prank(platform);
        vm.expectRevert(SettlementPool.OverMaxSettle.selector);
        pool.settle(keccak256("pos-4"), M1, 100_000 * 100, 66, 1, MAX_SETTLE + 1);
    }

    // --- pause ---
    function test_Settle_RejectsWhenPaused() public {
        _register(M1, merchantWallet);
        vm.prank(platform);
        pool.setPaused(true);
        vm.prank(platform);
        vm.expectRevert(SettlementPool.IsPaused.selector);
        pool.settle(keccak256("pos-5"), M1, 100_000 * 100, 66, 1, 40 * U);
    }

    // --- havuz likiditesi yetersiz ---
    function test_Settle_RejectsPoolInsufficient() public {
        _register(M1, merchantWallet);
        // maxSettle sınırını yükselt ki cap değil likidite tetiklensin
        vm.prank(platform);
        pool.setMaxSettleAmount(2_000_000 * U);
        vm.prank(platform);
        vm.expectRevert(SettlementPool.PoolInsufficient.selector);
        pool.settle(keccak256("pos-6"), M1, 100_000 * 100, 66, 1, 600_000 * U); // havuzda 500k var
    }

    // --- yalnız owner settle eder (bot/operatör) ---
    function test_Settle_OnlyOwner() public {
        _register(M1, merchantWallet);
        vm.prank(attacker);
        vm.expectRevert(SettlementPool.NotOwner.selector);
        pool.settle(keccak256("pos-7"), M1, 100_000 * 100, 66, 1, 40 * U);
    }

    // --- registry: yalnız owner kayıt yapar ---
    function test_Registry_OnlyOwnerRegisters() public {
        vm.prank(attacker);
        vm.expectRevert(MerchantRegistry.NotOwner.selector);
        registry.registerMerchant(M1, merchantWallet);
    }

    // --- registry: iki adımlı ownership ---
    function test_Registry_TwoStepOwnership() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(platform);
        registry.transferOwnership(newOwner);
        assertEq(registry.owner(), platform, "devir tamamlanmadan owner degismez");
        vm.prank(newOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), newOwner);
    }

    // --- ödeme adresi güncellenince yeni adrese ödenir ---
    function test_UpdatePayout_RoutesToNewAddress() public {
        _register(M1, merchantWallet);
        address newWallet = makeAddr("newWallet");
        vm.prank(platform);
        registry.updatePayout(M1, newWallet);
        _settle(keccak256("pos-8"), M1, 30 * U);
        assertEq(usdc.balanceOf(newWallet), 30 * U);
        assertEq(usdc.balanceOf(merchantWallet), 0);
    }
}
