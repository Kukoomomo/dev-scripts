const ethers = require("ethers")
const axios = require('axios');
const { expect } = require("chai")

// config 
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)

const proofApiUrl = 'http://localhost:8080/getProof';
const indexApiUrl = 'http://localhost:8080/getL2SyncHeight';
const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'

// contract address
const L1GRAddr = '0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6'
const L2GRAddr = '0x5300000000000000000000000000000000000002'
const L1CDMAddr = '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9'
const L2CDMAddr = '0x5300000000000000000000000000000000000007'
const L2MPAddr = '0x5300000000000000000000000000000000000001'
const RollupAddr = '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853'

// params
const dou = BigInt(2)
const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18

var l1gr
var l2gr
var l1cdm
var l2cdm
var rollup
var l2mp

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}

const sendEther = async () => {
    console.log("send 3 ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E")
    const privateKey1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const walletL1 = new ethers.Wallet(privateKey1, l1RpcProvider)
    const signerL1 = new ethers.Wallet(privateKey, l1RpcProvider)
    const tx = {
        to: '0xF1D598fD5f8367be41b0761696e643aC092b313E',
        value: ethers.utils.parseEther("3")
    }
    let l1Balance = (await signerL1.getBalance()).toString()

    if (l1Balance.length < 19) {
        let receipt = await walletL1.sendTransaction(tx)
        await receipt.wait()
    }
    console.log('l1 balances', (await signerL1.getBalance()).toString())
}

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    const L1GRArtifacts = require("../contracts/L1/gateways/L1GatewayRouter.sol/L1GatewayRouter.json")
    const L1CDMArtifacts = require("../contracts/L1/L1CrossDomainMessenger.sol/L1CrossDomainMessenger.json")
    const L2GRArtifacts = require("../contracts/L2/gateways/L2GatewayRouter.sol/L2GatewayRouter.json")
    const L2CDMArtifacts = require("../contracts/L2/L2CrossDomainMessenger.sol/L2CrossDomainMessenger.json")
    const RollupArtifacts = require("../contracts/L1/rollup/Rollup.sol/Rollup.json")
    const L2MPArtifacts = require("../contracts/L2/system/L2ToL1MessagePasser.sol/L2ToL1MessagePasser.json")

    // L1 Factory
    const l1GRFactory = new ethers.ContractFactory(
        L1GRArtifacts.abi,
        L1GRArtifacts.bytecode,
    ).connect(l1Signer)
    const l1CDMFactory = new ethers.ContractFactory(
        L1CDMArtifacts.abi,
        L1CDMArtifacts.bytecode,
    ).connect(l1Signer)
    const rollupFactory = new ethers.ContractFactory(
        RollupArtifacts.abi,
        RollupArtifacts.bytecode,
    ).connect(l1Signer)
    // L2 Factory
    const l2GRFactory = new ethers.ContractFactory(
        L2GRArtifacts.abi,
        L2GRArtifacts.bytecode,
    ).connect(l2Signer)
    const l2CDMFactory = new ethers.ContractFactory(
        L2CDMArtifacts.abi,
        L2CDMArtifacts.bytecode,
    ).connect(l2Signer)
    const l2MPFactory = new ethers.ContractFactory(
        L2MPArtifacts.abi,
        L2MPArtifacts.bytecode,
    ).connect(l2Signer)

    // contract setup
    l1gr = l1GRFactory.attach(L1GRAddr)
    l1cdm = l1CDMFactory.attach(L1CDMAddr)
    rollup = rollupFactory.attach(RollupAddr)
    l2gr = l2GRFactory.attach(L2GRAddr)
    l2cdm = l2CDMFactory.attach(L2CDMAddr)
    l2mp = l2MPFactory.attach(L2MPAddr)
}

const reportBalances = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    const l1Balance = (await l1Signer.getBalance()).toString().slice(0, -9)
    const l2Balance = (await l2Signer.getBalance()).toString().slice(0, -9)

    console.log(`On L1:${l1Balance} Gwei   On L2:${l2Balance} Gwei`)
}

const crossMsg = async () => {
   
}

const finalizeBatches = async () => {
    const res = await rollup.finalizeBatchesByNum(2)
    const receipt = await res.wait()
    console.log(`finalizeBatches status ${receipt.status == 1}, txHash ${receipt.transactionHash}`)
    let lastCommittedBatchIndex = await rollup.lastCommittedBatchIndex()
    let lastFinalizedBatchIndex = await rollup.lastFinalizedBatchIndex()
    console.log("lastCommittedBatchIndex", lastCommittedBatchIndex.toNumber())
    console.log("lastFinalizedBatchIndex", lastFinalizedBatchIndex.toNumber())
}

const relayByHash = async (hash) => {
    const msg = await withdrawMsgByHash(hash)
    const sender = msg[0].sender
    const target = msg[0].target
    const value = msg[0].value
    const nonce = msg[0].messageNonce
    const data = msg[0].message
    if (
        !ethers.utils.isAddress(sender) ||
        !ethers.utils.isAddress(target) ||
        !ethers.utils.isBytesLike(data)
    ) {
        console.log("params type not equal")
        return
    }
    const waitTime = await rollup.FINALIZATION_PERIOD_SECONDS()
    console.log(`wait rollup finalize`)
    await sleep(waitTime)
    await waitBatchFinalize(hash)
    const res = await l1cdm.relayMessage(
        sender,
        target,
        value,
        nonce,
        data,
    )
    const receipt = await res.wait()
    console.log(`Relay status ${receipt.status == 1}, txHash ${receipt.transactionHash}`)
}

const provenByHash = async (hash) => {
    const msg = await withdrawMsgByHash(hash)
    const sender = msg[0].sender
    const target = msg[0].target
    const value = msg[0].value
    const nonce = msg[0].messageNonce
    const data = msg[0].message

    const proofData = await getProofByNonce(nonce)

    const wdHash = await hashCrossMsg(
        sender,
        target,
        value,
        nonce,
        data,
    )
    if (wdHash != proofData.leaf) {
        console.log(`leaf params type not equal msgNonce ${nonce} proofIndex ${proofData.index} ${wdHash}, ${proofData.leaf}`)
        return
    }
    if (
        !ethers.utils.isAddress(msg[0].sender) ||
        !ethers.utils.isAddress(msg[0].target) ||
        !ethers.utils.isBytesLike(msg[0].message) ||
        !ethers.utils.isBytesLike(proofData.root)
    ) {
        console.log("params type not equal")
        return
    }
    res = await l1cdm.proveMessage(
        sender,
        target,
        value,
        nonce,
        data,
        proofData.proof,
        proofData.root,
    )
    receipt = await res.wait()
    console.log(`Proven status ${receipt.status == 1}, txHash ${receipt.transactionHash}`)
}

const getProofByNonce = async (nonce) => {
    console.log(`get proof from server with nonce ${nonce}`)
    return await axios.get(proofApiUrl, {
        params: {
            nonce: nonce
        }
    })
        .then(response => {
            return {
                leaf: response.data.leaf,
                proof: response.data.proof,
                root: response.data.root,
                index: response.data.index,
            }
        })
        .catch(error => {
            console.error(error);
        });
}

const getSyncNumber = async () => {
    return axios.get(indexApiUrl, {})
        .then(response => {
            return response.data
        })
        .catch(error => {
            console.error(error);
        });

}

const withdrawMsgByHash = async (hash) => {
    const receipt = await l2RpcProvider.getTransactionReceipt(hash)
    const msg = receipt.logs
        .filter((log) => {
            // Only look at logs emitted by the messenger address
            return log.address.toLocaleLowerCase() === l2cdm.address.toLocaleLowerCase()
        })
        .filter((log) => {
            // Only look at SentMessage logs specifically
            const parsed = l2cdm.interface.parseLog(log)
            return parsed.name === 'SentMessage'
        }).map((log) => {
            // Convert each SentMessage log into a message object
            const parsed = l2cdm.interface.parseLog(log)
            return {
                sender: parsed.args.sender,
                target: parsed.args.target,
                value: ethers.BigNumber.from(parsed.args.value).toString(),
                messageNonce: ethers.BigNumber.from(parsed.args.messageNonce).toString(),
                gasLimit: ethers.BigNumber.from(parsed.args.gasLimit).toString(),
                message: parsed.args.message,
                logIndex: log.logIndex,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
            }
        })
    return msg
}

const depositMsgByHash = async (hash) => {
    const receipt = await l1RpcProvider.getTransactionReceipt(hash)
    const msgs = receipt.logs
        .filter((log) => {

            // Only look at logs emitted by the messenger address
            return log.address.toLocaleLowerCase() === l1cdm.address.toLocaleLowerCase()
        })
        .filter((log) => {
            // Only look at SentMessage logs specifically
            const parsed = l1cdm.interface.parseLog(log)
            return parsed.name === 'SentMessage'
        }).map((log) => {
            // Convert each SentMessage log into a message object
            const parsed = l1cdm.interface.parseLog(log)
            return {
                sender: parsed.args.sender,
                target: parsed.args.target,
                value: ethers.BigNumber.from(parsed.args.value).toString(),
                messageNonce: ethers.BigNumber.from(parsed.args.messageNonce).toString(),
                gasLimit: ethers.BigNumber.from(parsed.args.gasLimit).toString(),
                message: parsed.args.message,
                logIndex: log.logIndex,
                blockNumber: log.blockNumber,
                transactionHash: log.transactionHash,
            }
        })
    return msgs
}

const hashCrossMsg = async (
    sender,
    target,
    value,
    nonce,
    data
) => {
    const encoded = l2cdm.interface.encodeFunctionData(
        'relayMessage',
        [
            sender,
            target,
            value,
            nonce,
            data,
        ]
    );
    const wdHash = ethers.utils.keccak256(encoded)
    return wdHash
}

const waitRollupSuccess = async (withdrawTxHash) => {
    const msgs = await withdrawMsgByHash(withdrawTxHash)
    const withdrawNum = msgs[0].blockNumber
    const tick = Date.now()

    let totalTimeMs = 0
    while (totalTimeMs < Infinity) {
        const commitNum = await rollup.latestL2BlockNumber()
        if (commitNum >= withdrawNum) {
            console.log(`time ${Date.now()} rollup succeed! commit number ${commitNum} , withdraw number ${withdrawNum}`)
            return
        }
        console.log(`time ${Date.now()} wait rollup! commit number ${commitNum} , withdraw number ${withdrawNum}`)
        await sleep(8000)
        totalTimeMs += Date.now() - tick
    }
}

const waitSyncSuccess = async (withdrawTxHash) => {
    const msgs = await withdrawMsgByHash(withdrawTxHash)
    const withdrawNum = msgs[0].blockNumber
    let totalTimeMs = 0
    const tick = Date.now()
    while (totalTimeMs < Infinity) {
        const syncNum = await getSyncNumber()
        if (syncNum >= withdrawNum) {
            console.log(`time ${Date.now()} backend sync succeed! sync number ${syncNum} , need ${withdrawNum}`)
            return
        }
        console.log(`time ${Date.now()} wait backend sync! sync number ${syncNum} , withdraw number ${withdrawNum}`)
        await sleep(2000)
        totalTimeMs += Date.now() - tick
    }
}


const waitBatchFinalize = async (withdrawTxHash) => {
    const msgs = await withdrawMsgByHash(withdrawTxHash)
    const withdrawNum = msgs[0].blockNumber
    const tick = Date.now()

    let totalTimeMs = 0
    while (totalTimeMs < Infinity) {
        const fbi = await rollup.lastFinalizedBatchIndex()
        const batchStorage = await rollup.committedBatchStores(fbi)
        const finalizeNum = batchStorage.blockNumber.toString()
        if (finalizeNum >= withdrawNum) {
            console.log(`time ${Date.now()} batch finalized succeed! finalize number ${finalizeNum} , withdraw number ${withdrawNum}`)
            return
        }
        console.log(`time ${Date.now()} wait batch finalized! finalize number ${finalizeNum} , withdraw number ${withdrawNum}`)
        await sleep(8000)
        totalTimeMs += Date.now() - tick
    }
}

const waitDepositSuccess = async (depositHash) => {
    let totalTimeMs = 0
    const tick = Date.now()
    const msgs = await depositMsgByHash(depositHash)
    const sender = msgs[0].sender
    const target = msgs[0].target
    const value = msgs[0].value
    const nonce = msgs[0].messageNonce
    const data = msgs[0].message
    const xDomainCalldataHash = await hashCrossMsg(
        sender,
        target,
        value,
        nonce,
        data
    )

    while (totalTimeMs < Infinity) {
        const executed = await l2cdm.isL1MessageExecuted(xDomainCalldataHash)
        if (executed) {
            console.log(`time ${Date.now()} l1 msg executed ${executed}`)
            return
        }
        console.log(`time ${Date.now()} l1 msg executed ${executed}`)
        await sleep(4000)
        totalTimeMs += Date.now() - tick
    }
}

const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const testSleep = async (ms) => {
    let i = 0
    while (i < 5) {
        await sleep(4000)
        console.log(`now in index ${i}`)
        i++
    }
}

const main = async () => {
    await sendEther()
    await setup()
    await crossMsg()
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
