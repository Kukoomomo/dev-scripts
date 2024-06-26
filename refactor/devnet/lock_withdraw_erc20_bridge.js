const ethers = require("ethers");
const axios = require("axios");
const { expect } = require("chai");

const ProxyArtifacts = require("../contracts/libraries/External.sol/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json");
const IProxyArtifacts = require("../contracts/libraries/External.sol/TransparentUpgradeableProxy.sol/ITransparentUpgradeableProxy.json");
const EmptyContractArtifacts = require("../contracts/misc/EmptyContract.sol/EmptyContract.json");

const L1GRArtifacts = require("../contracts/L1/gateways/L1GatewayRouter.sol/L1GatewayRouter.json");
const L1CDMArtifacts = require("../contracts/L1/L1CrossDomainMessenger.sol/L1CrossDomainMessenger.json");
const RollupArtifacts = require("../contracts/L1/rollup/Rollup.sol/Rollup.json");
const L2GRArtifacts = require("../contracts/L2/gateways/L2GatewayRouter.sol/L2GatewayRouter.json");
const L2CDMArtifacts = require("../contracts/L2/L2CrossDomainMessenger.sol/L2CrossDomainMessenger.json");
const L2MPArtifacts = require("../contracts/L2/system/L2ToL1MessagePasser.sol/L2ToL1MessagePasser.json");
const ERC20Artifacts = require("../contracts/libraries/token/MockERC20.sol/MockERC20.json");
const L1CustomERC20GatewayArtifacts = require("../contracts/L1/gateways/L1CustomERC20Gateway.sol/L1CustomERC20Gateway.json");
const L2LockERC20GatewayArtifacts = require("../contracts/L2/gateways/L2WithdrawLockERC20Gateway.sol/L2WithdrawLockERC20Gateway.json");
const MorphStandardERC20Artifacts = require("../contracts/libraries/token/MorphStandardERC20.sol/MorphStandardERC20.json");

// config
const l1Url = `http://localhost:9545`;
const l2Url = `http://localhost:8545`;
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url);
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url);

const proofApiUrl = "http://localhost:8080/getProof";
const indexApiUrl = "http://localhost:8080/getL2SyncHeight";
const privateKey =
    "0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f";
const ownerKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ProxyAdminImplAddr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// contract address
const L1GRAddr = "0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6";
const L2GRAddr = "0x5300000000000000000000000000000000000002";
const L1CDMAddr = "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9";
const L2CDMAddr = "0x5300000000000000000000000000000000000007";
const L2MPAddr = "0x5300000000000000000000000000000000000001";
const RollupAddr = "0xa513e6e4b8f2a923d98304ec87f64353c4d5c853";

const L1ERC20GatewayAddr = "";
const L2ERC20GatewayAddr = "";

const L1ERC20Addr = "";
const L2ERC20Addr = "";

// params
const oneToken = BigInt(1e18);
let ourAddr; // The address of the signer we use.

var l1gr;
var l2gr;
var l1cdm;
var l2cdm;
var rollup;
var l2mp;
var l1token;
var l2token;
var l1Empty;
var l2Empty;
var L1ERC20Gateway;
var L2ERC20Gateway;

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider);
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider);

    return [l1Wallet, l2Wallet];
};

const sendEther = async () => {
    console.log("send 3 ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E");

    const walletL1 = new ethers.Wallet(ownerKey, l1RpcProvider);
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

const deployGatewayAndInit = async () => {
    const [l1Signer, l2Signer] = await getSigners();
    if (
        ethers.utils.isAddress(L1ERC20GatewayAddr) &&
        ethers.utils.isAddress(L2ERC20GatewayAddr)
    ) {
        const L1ERC20GatewayFactory = new ethers.ContractFactory(
            L1CustomERC20GatewayArtifacts.abi,
            L1CustomERC20GatewayArtifacts.bytecode
        ).connect(l1Signer);
        const L2ERC20GatewayFactory = new ethers.ContractFactory(
            L2LockERC20GatewayArtifacts.abi,
            L2LockERC20GatewayArtifacts.bytecode
        ).connect(l2Signer);
        L1ERC20Gateway = L1ERC20GatewayFactory.attach(L1ERC20GatewayAddr)
        L2ERC20Gateway = L2ERC20GatewayFactory.attach(L1ERC20GatewayAddr)
        return
    }
    const L1ProxyFactory = new ethers.ContractFactory(
        ProxyArtifacts.abi,
        ProxyArtifacts.bytecode
    ).connect(l1Signer);
    const L2ProxyFactory = new ethers.ContractFactory(
        ProxyArtifacts.abi,
        ProxyArtifacts.bytecode
    ).connect(l2Signer);

    // gateway setup
    const L1ERC20GatewayFactory = new ethers.ContractFactory(
        L1CustomERC20GatewayArtifacts.abi,
        L1CustomERC20GatewayArtifacts.bytecode
    ).connect(l1Signer);
    const L2ERC20GatewayFactory = new ethers.ContractFactory(
        L2LockERC20GatewayArtifacts.abi,
        L2LockERC20GatewayArtifacts.bytecode
    ).connect(l2Signer);
    // proxy deploy
    L1ERC20Gateway = await L1ProxyFactory.deploy(
        l1Empty.address,
        l1Signer.address,
        "0x"
    );
    await L1ERC20Gateway.deployed();
    L2ERC20Gateway = await L2ProxyFactory.deploy(
        l2Empty.address,
        l2Signer.address,
        "0x"
    );
    await L2ERC20Gateway.deployed();
    console.log(`gateway proxy deploy success`)

    // impl deploy
    const L1ERC20GatewayImpl = await L1ERC20GatewayFactory.deploy();
    await L1ERC20GatewayImpl.deployed();
    const L2ERC20GatewayImpl = await L2ERC20GatewayFactory.deploy();
    await L2ERC20GatewayImpl.deployed();
    console.log(`gateway impl deploy success`)

    // init
    const IL1ERC20GatewayF = new ethers.ContractFactory(
        IProxyArtifacts.abi,
        ProxyArtifacts.bytecode
    ).connect(l1Signer);
    const IL1ERC20Gateway = IL1ERC20GatewayF.attach(L1ERC20Gateway.address)
    let res = await IL1ERC20Gateway.upgradeToAndCall(
        L1ERC20GatewayImpl.address,
        L1ERC20GatewayFactory.interface.encodeFunctionData("initialize", [
            L2ERC20Gateway.address, // _counterpart
            L1GRAddr, // router
            L1CDMAddr // messenger
        ])
    );
    let rec = await res.wait()
    console.log(`upgrade L1ERC20Gateway ${rec.status == 1}`)

    const IL2ERC20GatewayF = new ethers.ContractFactory(
        IProxyArtifacts.abi,
        ProxyArtifacts.bytecode
    ).connect(l2Signer);
    const IL2ERC20Gateway = IL2ERC20GatewayF.attach(L2ERC20Gateway.address)
    res = await IL2ERC20Gateway.upgradeToAndCall(
        L2ERC20GatewayImpl.address,
        L2ERC20GatewayFactory.interface.encodeFunctionData("initialize", [
            L1ERC20Gateway.address, // _counterpart
            '0x5300000000000000000000000000000000000002', // router
            '0x5300000000000000000000000000000000000007' // messenger
        ])
    );
    rec = await res.wait()
    console.log(`upgrade L2ERC20Gateway ${rec.status == 1}`)
    // change admin
    res = await IL1ERC20Gateway.changeAdmin(ProxyAdminImplAddr)
    rec = await res.wait()
    console.log(`changeAdmin L1ERC20Gateway ${rec.status == 1}`)
    res = await IL2ERC20Gateway.changeAdmin(ProxyAdminImplAddr)
    rec = await res.wait()
    console.log(`changeAdmin L2ERC20Gateway ${rec.status == 1}`)

    // update mapping
    res = await L1ERC20GatewayFactory.attach(L1ERC20Gateway.address).updateTokenMapping(l1token.address, l2token.address)
    rec = await res.wait()
    console.log(`updateTokenMapping L1ERC20Gateway ${rec.status == 1}`)

    res = await L2ERC20GatewayFactory.attach(L2ERC20Gateway.address).updateTokenMapping(l2token.address, l1token.address)
    rec = await res.wait()
    console.log(`updateTokenMapping L2ERC20Gateway ${rec.status == 1}`)

    // check status
    const mapL1 = await L1ERC20GatewayFactory.attach(L1ERC20Gateway.address).tokenMapping(l1token.address)
    if (mapL1.toLocaleLowerCase() != l2token.address.toLocaleLowerCase()) {
        console.log(`L1ERC20Gateway update token mapping failed ${mapL1} != ${l2token.address}`)
        return
    }
    const mapL2 = await L2ERC20GatewayFactory.attach(L2ERC20Gateway.address).tokenMapping(l2token.address)
    if (mapL2.toLocaleLowerCase() != l1token.address.toLocaleLowerCase()) {
        console.log(`L2ERC20Gateway update token mapping failed ${mapL2} != ${l1token.address}`)
        return
    }
    expect(await L2ERC20GatewayFactory.attach(L2ERC20Gateway.address).withdrawLock(l2token.address)).to.eq(true)
    let tokens = [l1token.address]
    let gateways = [L1ERC20Gateway.address]
    // set to gateway router
    const walletL1 = new ethers.Wallet(ownerKey, l1RpcProvider);
    const walletL2 = new ethers.Wallet(ownerKey, l2RpcProvider);
    res = await l1gr.connect(walletL1).setERC20Gateway(tokens, gateways)
    rec = await res.wait()
    tokens = [l2token.address]
    gateways = [L2ERC20Gateway.address]
    res = await l2gr.connect(walletL2).setERC20Gateway(tokens, gateways)
    rec = await res.wait()
    // set withdraw lock
    res = await L2ERC20GatewayFactory.attach(L2ERC20Gateway.address).updateWithdrawLock(l2token.address, false)
    rec = await res.wait()
    expect(await L2ERC20GatewayFactory.attach(L2ERC20Gateway.address).withdrawLock(l2token.address)).to.eq(false)
    console.log(`L1ERC20Gateway ${L1ERC20Gateway.address} L2ERC20Gateway ${L2ERC20Gateway.address}`)
};

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners();
    ourAddr = l1Signer.address;

    // L1 Factory
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
    const L1EmptyContractFactory = new ethers.ContractFactory(
        EmptyContractArtifacts.abi,
        EmptyContractArtifacts.bytecode
    ).connect(l1Signer);
    const L2EmptyContractFactory = new ethers.ContractFactory(
        EmptyContractArtifacts.abi,
        EmptyContractArtifacts.bytecode
    ).connect(l2Signer);
    // contract setup
    l1gr = l1GRFactory.attach(L1GRAddr);
    l1cdm = l1CDMFactory.attach(L1CDMAddr);
    rollup = rollupFactory.attach(RollupAddr);
    l2gr = l2GRFactory.attach(L2GRAddr);
    l2cdm = l2CDMFactory.attach(L2CDMAddr);
    l2mp = l2MPFactory.attach(L2MPAddr);

    await depositEther();
    await reportBalances();

    // deposit l1 and l2 token
    l1Empty = await L1EmptyContractFactory.deploy();
    await l1Empty.deployed();
    l2Empty = await L2EmptyContractFactory.deploy();
    await l2Empty.deployed();

    if (L1ERC20Addr === "" || L2ERC20Addr === "") {
        l1token = await L1ERC20Factory.deploy("L1Token", "l1token", 18);
        await l1token.deployed();
        l2token = await L2ERC20Factory.deploy("L2Token", "l2token", 18);
        await l2token.deployed();
    } else {
        l1token = L1ERC20Factory.attach(L1ERC20Addr);
        l2token = L1ERC20Factory.attach(L2ERC20Addr);
    }
    console.log(`L1 Token ${l1token.address} , L2 Token ${l2token.address}`);
    await reportERC20Balances();
    await deployGatewayAndInit();
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
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds \n`);
};

const depositERC20 = async () => {
    console.log("Deposit ERC20");
    await reportBalances();
    await reportERC20Balances();
    const start = new Date();

    // mint l1 token
    const l1Balance = (await l1token.balanceOf(ourAddr)).toString();
    if (l1Balance.length < 19) {
        let res = await l1token.mint(ourAddr, oneToken);
        let rec = await res.wait();
        const balance = await l1token.balanceOf(ourAddr);
        console.log(`mint ${rec.status == 1}: ${ourAddr} has balance ${balance}`);
    }

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
    await waitDepositSuccess(rec.transactionHash);
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
    await waitRollupSuccess(rec.transactionHash);
    await waitSyncSuccess(rec.transactionHash);
    await waitBatchFinalize(rec.transactionHash);
    await provenAndRelayByHash(rec.transactionHash);
    await reportERC20Balances();
    console.log(`withdrawERC20 took ${(new Date() - start) / 1000} seconds\n\n`);
};

const provenAndRelayByHash = async (hash) => {
    const msg = await withdrawMsgByHash(hash);
    const sender = msg[0].sender;
    const target = msg[0].target;
    const value = msg[0].value;
    const nonce = msg[0].messageNonce;
    const data = msg[0].message;

    const proofData = await getProofByNonce(nonce);

    const wdHash = await hashCrossMsg(sender, target, value, nonce, data);
    if (wdHash.toLocaleLowerCase() !== proofData.leaf.toLocaleLowerCase()) {
        console.log(
            `leaf params type not equal msgNonce ${nonce} proofIndex ${proofData.index} ${wdHash}, ${proofData.leaf}`
        );
        return;
    }
    if (
        !ethers.utils.isAddress(msg[0].sender) ||
        !ethers.utils.isAddress(msg[0].target) ||
        !ethers.utils.isBytesLike(msg[0].message) ||
        !ethers.utils.isBytesLike(proofData.root)
    ) {
        console.log("params type not equal");
        return;
    }
    res = await l1cdm.proveAndRelayMessage(
        sender,
        target,
        value,
        nonce,
        data,
        proofData.proof,
        proofData.root
    );
    receipt = await res.wait();
    console.log(
        `Proven status ${receipt.status == 1}, txHash ${receipt.transactionHash}`
    );
};

const getProofByNonce = async (nonce) => {
    console.log(`get proof from server with nonce ${nonce}`);
    return await axios
        .get(proofApiUrl, {
            params: {
                nonce: nonce,
            },
        })
        .then((response) => {
            return {
                leaf: response.data.leaf,
                proof: response.data.proof,
                root: response.data.root,
                index: response.data.index,
            };
        })
        .catch((error) => {
            console.error(error);
        });
};

const getSyncNumber = async () => {
    return axios
        .get(indexApiUrl, {})
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            console.error(error);
        });
};

const withdrawMsgByHash = async (hash) => {
    const receipt = await l2RpcProvider.getTransactionReceipt(hash);
    const msg = receipt.logs
        .filter((log) => {
            // Only look at logs emitted by the messenger address
            return (
                log.address.toLocaleLowerCase() === l2cdm.address.toLocaleLowerCase()
            );
        })
        .filter((log) => {
            // Only look at SentMessage logs specifically
            const parsed = l2cdm.interface.parseLog(log);
            return parsed.name === "SentMessage";
        })
        .map((log) => {
            // Convert each SentMessage log into a message object
            const parsed = l2cdm.interface.parseLog(log);
            return {
                sender: parsed.args.sender,
                target: parsed.args.target,
                value: ethers.BigNumber.from(parsed.args.value).toString(),
                messageNonce: ethers.BigNumber.from(
                    parsed.args.messageNonce
                ).toString(),
                gasLimit: ethers.BigNumber.from(parsed.args.gasLimit).toString(),
                message: parsed.args.message,
                logIndex: log.logIndex,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
            };
        });
    return msg;
};

const depositMsgByHash = async (hash) => {
    const receipt = await l1RpcProvider.getTransactionReceipt(hash);
    const msgs = receipt.logs
        .filter((log) => {
            // Only look at logs emitted by the messenger address
            return (
                log.address.toLocaleLowerCase() === l1cdm.address.toLocaleLowerCase()
            );
        })
        .filter((log) => {
            // Only look at SentMessage logs specifically
            const parsed = l1cdm.interface.parseLog(log);
            return parsed.name === "SentMessage";
        })
        .map((log) => {
            // Convert each SentMessage log into a message object
            const parsed = l1cdm.interface.parseLog(log);
            return {
                sender: parsed.args.sender,
                target: parsed.args.target,
                value: ethers.BigNumber.from(parsed.args.value).toString(),
                messageNonce: ethers.BigNumber.from(
                    parsed.args.messageNonce
                ).toString(),
                gasLimit: ethers.BigNumber.from(parsed.args.gasLimit).toString(),
                message: parsed.args.message,
                logIndex: log.logIndex,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
            };
        });
    return msgs;
};

const hashCrossMsg = async (sender, target, value, nonce, data) => {
    const encoded = l2cdm.interface.encodeFunctionData("relayMessage", [
        sender,
        target,
        value,
        nonce,
        data,
    ]);
    const wdHash = ethers.utils.keccak256(encoded);
    return wdHash;
};

const waitRollupSuccess = async (withdrawTxHash) => {
    const msgs = await withdrawMsgByHash(withdrawTxHash);
    const withdrawNum = msgs[0].blockNumber;
    const tick = Date.now();

    let totalTimeMs = 0;
    while (totalTimeMs < Infinity) {
        const commitNum = await rollup.latestL2BlockNumber();
        if (commitNum >= withdrawNum) {
            console.log(
                `time ${Date.now()} rollup succeed! commit number ${commitNum} , withdraw number ${withdrawNum}`
            );
            return;
        }
        console.log(
            `time ${Date.now()} wait rollup! commit number ${commitNum} , withdraw number ${withdrawNum}`
        );
        await sleep(8000);
        totalTimeMs += Date.now() - tick;
    }
};

const waitBatchFinalize = async (withdrawTxHash) => {
    const msgs = await withdrawMsgByHash(withdrawTxHash);
    const withdrawNum = msgs[0].blockNumber;
    const tick = Date.now();

    let totalTimeMs = 0;
    while (totalTimeMs < Infinity) {
        const fbi = await rollup.lastFinalizedBatchIndex();
        const batchStorage = await rollup.batchBaseStore(fbi);
        const finalizeNum = batchStorage.blockNumber.toString();
        if (finalizeNum >= withdrawNum) {
            console.log(
                `time ${Date.now()} batch finalized succeed! finalize number ${finalizeNum} , withdraw number ${withdrawNum}`
            );
            return;
        }
        console.log(
            `time ${Date.now()} wait batch finalized! finalize number ${finalizeNum} , withdraw number ${withdrawNum}`
        );
        await sleep(8000);
        totalTimeMs += Date.now() - tick;
    }
};

const waitSyncSuccess = async (withdrawTxHash) => {
    const msgs = await withdrawMsgByHash(withdrawTxHash);
    const withdrawNum = msgs[0].blockNumber;
    let totalTimeMs = 0;
    const tick = Date.now();
    while (totalTimeMs < Infinity) {
        const syncNum = await getSyncNumber();
        if (syncNum >= withdrawNum) {
            console.log(
                `time ${Date.now()} backend sync succeed! sync number ${syncNum} , need ${withdrawNum}`
            );
            return;
        }
        console.log(
            `time ${Date.now()} wait backend sync! sync number ${syncNum} , withdraw number ${withdrawNum}`
        );
        await sleep(2000);
        totalTimeMs += Date.now() - tick;
    }
};

const waitDepositSuccess = async (depositHash) => {
    let totalTimeMs = 0;
    const tick = Date.now();
    const msgs = await depositMsgByHash(depositHash);
    const sender = msgs[0].sender;
    const target = msgs[0].target;
    const value = msgs[0].value;
    const nonce = msgs[0].messageNonce;
    const data = msgs[0].message;
    const xDomainCalldataHash = await hashCrossMsg(
        sender,
        target,
        value,
        nonce,
        data
    );

    while (totalTimeMs < Infinity) {
        const executed = await l2cdm.isL1MessageExecuted(xDomainCalldataHash);
        if (executed) {
            console.log(`time ${Date.now()} l1 msg executed ${executed}`);
            return;
        }
        console.log(`time ${Date.now()} l1 msg executed ${executed}`);
        await sleep(4000);
        totalTimeMs += Date.now() - tick;
    }
};

const sleep = async (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async () => {
    await sendEther();
    await setup();
    await depositERC20();
    await withdrawERC20();
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
