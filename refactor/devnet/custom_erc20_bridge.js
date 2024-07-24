const ethers = require("ethers");
const {
    getAddressByName,
    waitDepositSuccess,
    waitRollupSuccess,
    waitBatchFinalize,
    waitSyncSuccess,
    provenAndRelayByHash,
    addToTokenList,
} = require("../utils");
const { expect } = require("chai");

// config
const l1Url = `http://localhost:9545`;
const l2Url = `http://localhost:8545`;
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url);
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url);

const privateKey =
    "0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f";
const privateKey1 =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
let walletL1 = new ethers.Wallet(privateKey1, l1RpcProvider);
let walletL2 = new ethers.Wallet(privateKey1, l2RpcProvider);

// contract address
const L1CEGAddr = getAddressByName("Proxy__L1CustomERC20Gateway");
const L1GRAddr = getAddressByName("Proxy__L1GatewayRouter");
const L2GRAddr = "0x5300000000000000000000000000000000000002";
const L1CDMAddr = getAddressByName("Proxy__L1CrossDomainMessenger");
const L2CDMAddr = "0x5300000000000000000000000000000000000007";
const L2MPAddr = "0x5300000000000000000000000000000000000001";
const RollupAddr = getAddressByName("Proxy__Rollup");
const L2CEGAddr = "0x5300000000000000000000000000000000000016";

const L1ERC20Addr = "";
const L2ERC20Addr = "";

// params
const oneToken = BigInt(1e18);
let ourAddr; // The address of the signer we use.

var l1ceg;
var l1gr;
var l2gr;
var l1cdm;
var l2cdm;
var rollup;
var l1token;
var l2token;
var l2ceg;

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider);
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider);

    return [l1Wallet, l2Wallet];
};

const sendEther = async () => {
    console.log("send 3 ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E");
    const signerL1 = new ethers.Wallet(privateKey, l1RpcProvider);
    const tx = {
        to: "0xF1D598fD5f8367be41b0761696e643aC092b313E",
        value: ethers.utils.parseEther("3"),
    };
    let l1Balance = (await signerL1.getBalance()).toString();

    if (l1Balance.length < 19) {
        let receipt = await walletL1.sendTransaction(tx);
        await receipt.wait();
    }
    console.log("l1 balances", (await signerL1.getBalance()).toString());
};

const depositEther = async () => {
    const [l1Signer, l2Signer] = await getSigners();

    let l2Balance = (await l2Signer.getBalance()).toString();

    if (l2Balance.length < 18) {
        await depositETH();
    }
};

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners();
    ourAddr = l1Signer.address;

    const L1CEGArtifacts = require("../contracts/l1/gateways/L1CustomERC20Gateway.sol/L1CustomERC20Gateway.json");
    const L1GRArtifacts = require("../contracts/l1/gateways/L1GatewayRouter.sol/L1GatewayRouter.json");
    const L2GRArtifacts = require("../contracts/l2/gateways/L2GatewayRouter.sol/L2GatewayRouter.json");
    const L1CDMArtifacts = require("../contracts/l1/L1CrossDomainMessenger.sol/L1CrossDomainMessenger.json");
    const L2CDMArtifacts = require("../contracts/l2/L2CrossDomainMessenger.sol/L2CrossDomainMessenger.json");
    const RollupArtifacts = require("../contracts/l1/rollup/Rollup.sol/Rollup.json");
    const L2MPArtifacts = require("../contracts/l2/system/L2ToL1MessagePasser.sol/L2ToL1MessagePasser.json");
    const L2CEGArtifacts = require("../contracts/l2/gateways/L2CustomERC20Gateway.sol/L2CustomERC20Gateway.json");

    const ERC20Artifacts = require("../contracts/libraries/token/MockERC20.sol/MockERC20.json");

    // L1 Factory
    const l1CEGFactory = new ethers.ContractFactory(
        L1CEGArtifacts.abi,
        L1CEGArtifacts.bytecode
    ).connect(l1Signer);
    const l1GRFactory = new ethers.ContractFactory(
        L1GRArtifacts.abi,
        L1GRArtifacts.bytecode
    ).connect(l1Signer);
    const l1CDMFactory = new ethers.ContractFactory(
        L1CDMArtifacts.abi,
        L1CDMArtifacts.bytecode
    ).connect(l1Signer);
    const rollupFactory = new ethers.ContractFactory(
        RollupArtifacts.abi,
        RollupArtifacts.bytecode
    ).connect(l1Signer);
    // L2 Factory
    const l2CEGFactory = new ethers.ContractFactory(
        L2CEGArtifacts.abi,
        L2CEGArtifacts.bytecode
    ).connect(l2Signer);
    const l2GRFactory = new ethers.ContractFactory(
        L2GRArtifacts.abi,
        L2GRArtifacts.bytecode
    ).connect(l2Signer);
    const l2CDMFactory = new ethers.ContractFactory(
        L2CDMArtifacts.abi,
        L2CDMArtifacts.bytecode
    ).connect(l2Signer);
    const l2MPFactory = new ethers.ContractFactory(
        L2MPArtifacts.abi,
        L2MPArtifacts.bytecode
    ).connect(l2Signer);
    const L1ERC20Factory = new ethers.ContractFactory(
        ERC20Artifacts.abi,
        ERC20Artifacts.bytecode
    ).connect(l1Signer);
    const L2ERC20Factory = new ethers.ContractFactory(
        ERC20Artifacts.abi,
        ERC20Artifacts.bytecode
    ).connect(l2Signer);
    // contract setup
    l1ceg = l1CEGFactory.attach(L1CEGAddr);
    l1gr = l1GRFactory.attach(L1GRAddr);
    l1cdm = l1CDMFactory.attach(L1CDMAddr);
    rollup = rollupFactory.attach(RollupAddr);
    l2gr = l2GRFactory.attach(L2GRAddr);
    l2cdm = l2CDMFactory.attach(L2CDMAddr);
    l2mp = l2MPFactory.attach(L2MPAddr);
    l2ceg = l2CEGFactory.attach(L2CEGAddr);
    if (L1ERC20Addr === "" && L2ERC20Addr === "") {
        l1token = await L1ERC20Factory.deploy("L1Token Custom", "l1token", 18);
        await l1token.deployed();
        l2token = await L2ERC20Factory.deploy("L2Token Custom", "l2token", 18);
        await l2token.deployed();
        console.log(`L1 Token ${l1token.address} , L2 Token ${l2token.address}`);
    } else {
        l1token = L1ERC20Factory.attach(L1ERC20Addr);
        l2token = L2ERC20Factory.attach(L2ERC20Addr);
    }

    // set gateway
    let res = await l1gr
        .connect(walletL1)
        .setERC20Gateway([l1token.address], [L1CEGAddr]);
    let rec = await res.wait();
    console.log(`L1 router set ERC20 gateway ${rec.status == 1}`);
    res = await l2gr
        .connect(walletL2)
        .setERC20Gateway([l2token.address], [L2CEGAddr]);
    rec = await res.wait();
    console.log(`L2 router set ERC20 gateway ${rec.status == 1}`);
    // update token mapping
    res = await l1ceg
        .connect(walletL1)
        .updateTokenMapping(l1token.address, l2token.address);
    rec = await res.wait();
    console.log(`L1 custom gateway update token mapping ${rec.status == 1}`);
    res = await l2ceg
        .connect(walletL2)
        .updateTokenMapping(l2token.address, l1token.address);
    rec = await res.wait();
    console.log(`L2 custom gateway update token mapping ${rec.status == 1}`);

    const l2TokenAddr = await l1gr.getL2ERC20Address(l1token.address);
    console.log(`get l2 address from l1 router ${l2TokenAddr}`);
    await addToTokenList(l1token.address, l2token.address);
    await depositEther();
    await reportBalances();
};

const reportERC20Balances = async () => {
    const [l1Signer, l2Signer] = await getSigners();
    const l1Balance = (await l1token.balanceOf(l1Signer.address)).toString();
    const code = await l2Signer.provider.getCode(l2token.address);
    let l2Balance;
    if (code !== "0x") {
        // l2token exist
        l2Balance = (await l2token.balanceOf(l2Signer.address)).toString();
    }
    console.log(
        `Token on L1 balances:${l1Balance}     Token on L2 balances:${l2Balance}`
    );
};

const reportBalances = async () => {
    const [l1Signer, l2Signer] = await getSigners();
    const l1Balance = (await l1Signer.getBalance()).toString().slice(0, -9);
    const l2Balance = (await l2Signer.getBalance()).toString().slice(0, -9);

    console.log(`ethers On L1:${l1Balance} Gwei   On L2:${l2Balance} Gwei`);
};

const depositETH = async () => {
    console.log("Deposit ETH");
    await reportBalances();
    const start = new Date();

    // deposit 1 ether use gasLimit 100000 and value 1.1 ether
    const res = await l1gr["depositETH(uint256,uint256)"](
        ethers.utils.parseEther("1"),
        210000,
        { value: ethers.utils.parseEther("1.1") }
    );
    const receipt = await res.wait();
    console.log(
        `Deposit status ${receipt.status == 1}, txHash ${receipt.transactionHash}`
    );
    await waitDepositSuccess(receipt.transactionHash);
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds`);
};

const lockERC20 = async () => {
    console.log("Lock ERC20");
    await ERC20Mint();
    await reportBalances();
    const start = new Date();
    let res = await l1token.transfer(l1ceg.address, oneToken);
    let rec = await res.wait();
    let gatewayBalance = (await l1token.balanceOf(l1ceg.address)).toString();
    console.log(
        `locked ${rec.status == 1}: gateway has balance ${gatewayBalance}`
    );
};

const ERC20Mint = async () => {
    // mint l1 token
    const l1Balance = (await l1token.balanceOf(ourAddr)).toString();
    if (l1Balance.length < 19) {
        let res = await l1token.mint(ourAddr, oneToken);
        let rec = await res.wait();
        const balance = await l1token.balanceOf(ourAddr);
        console.log(`mint ${rec.status == 1}: ${ourAddr} has balance ${balance}`);
    }
};
const depositERC20 = async () => {
    console.log("Deposit ERC20");
    await ERC20Mint();
    await reportBalances();
    const start = new Date();

    // approve
    let res = await l1token.approve(l1gr.address, oneToken);
    let rec = await res.wait();
    const allowance = await l1token.allowance(ourAddr, l1gr.address);
    console.log(
        `approve ${rec.status == 1}: router ${l1gr.address
        } has allowance ${allowance}`
    );

    // deposit with oneToken use gasLimit 100000 and value 1 ether
    res = await l1gr["depositERC20(address,uint256,uint256)"](
        l1token.address,
        oneToken,
        420000,
        { value: ethers.utils.parseEther("1") }
    );
    rec = await res.wait();
    console.log(
        `Deposit status ${rec.status == 1}, txHash ${rec.transactionHash}`
    );
    await waitDepositSuccess(l1RpcProvider, rec.transactionHash, l1cdm, l2cdm);
    await reportERC20Balances();
    console.log(`depositERC20 took ${(new Date() - start) / 1000} seconds\n\n`);
};

const withdrawERC20 = async () => {
    console.log("Withdraw ERC20");
    await reportERC20Balances();
    const start = new Date();

    // approve
    let res = await l2token.approve(l2gr.address, oneToken);
    let rec = await res.wait();
    const allowance = await l2token.allowance(ourAddr, l2gr.address);
    console.log(
        `approve ${rec.status == 1}: router ${l2gr.address
        } has allowance ${allowance}`
    );

    // withdraw
    res = await l2gr["withdrawERC20(address,uint256,uint256)"](
        l2token.address,
        oneToken,
        110000,
        { value: 0 }
    );
    rec = await res.wait();
    console.log(
        `Withdraw status ${rec.status == 1}, txHash ${rec.transactionHash},height ${rec.blockNumber
        }`
    );
    await waitRollupSuccess(l2RpcProvider, rec.transactionHash, l2cdm, rollup);
    await waitSyncSuccess(l2RpcProvider, rec.transactionHash, l2cdm);
    await waitBatchFinalize(l2RpcProvider, rec.transactionHash, l2cdm, rollup);
    await provenAndRelayByHash(l2RpcProvider, rec.transactionHash, l1cdm, l2cdm);
    await reportERC20Balances();
    console.log(`withdrawERC20 took ${(new Date() - start) / 1000} seconds\n\n`);
};

const main = async () => {
    await sendEther();
    await setup();
    for (let i = 0; i < 100; i++) {
        await lockERC20();
        await depositERC20();
        await withdrawERC20();
    }
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
