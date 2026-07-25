// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {SettlementPool} from "../src/SettlementPool.sol";

/// @notice Troia (built on Arc) deploy: Registry + SettlementPool, demo merchant kaydı.
/// Arc testnet:
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --private-key <PK> --broadcast
/// Arc'ta gerçek USDC: 0x3600000000000000000000000000000000000000 (env USDC_ADDR ile ver).
/// Yerel/mock: USDC_ADDR verilmezse MockUSDC basılır.
contract Deploy is Script {
    // Arc testnet USDC (ERC-20, 6 decimals)
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();
        address deployer = msg.sender;

        address usdcAddr = vm.envOr("USDC_ADDR", address(0));
        if (usdcAddr == address(0)) {
            MockUSDC usdc = new MockUSDC();
            usdc.mint(deployer, 1_000_000e6);
            usdcAddr = address(usdc);
            console.log("MockUSDC:   ", usdcAddr);
        }

        MerchantRegistry registry = new MerchantRegistry(deployer);
        SettlementPool pool = new SettlementPool(usdcAddr, address(registry), 10_000e6); // 10k USDC cap

        // demo merchant kaydı (onboarding örneği)
        bytes32 demoMerchant = keccak256("merchant.demo-store");
        registry.registerMerchant(demoMerchant, deployer); // prod: Circle Wallet adresi

        console.log("Registry:   ", address(registry));
        console.log("Pool:       ", address(pool));
        console.log("Demo mrcht: ");
        console.logBytes32(demoMerchant);
        console.log("Note: pool'u fonlamak icin usdc.approve(pool) + pool.fundPool(amount)");
        vm.stopBroadcast();
    }
}
