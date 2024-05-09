const fs = require('fs');
const ethers = require("ethers")
const axios = require('axios');

const proofApiUrl = 'http://localhost:8080/getProof'
const indexApiUrl = 'http://localhost:8080/getL2ConfirmHeight'
const addressesFilePath = './devnetL1.json'

const getSyncNumber = async () => {
    return axios.get(indexApiUrl, {})
        .then(response => {
            return response.data
        })
        .catch(error => {
            console.error(error);
        });

}
// bridge backend api get proof
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

// get address from json file 
const getAddressByName = (contractsName) => {
    try {
        const addressFile = fs.readFileSync(addressesFilePath);
        const array = JSON.parse(addressFile);
        for (let element of array) {
            if (element.name == contractsName && ethers.utils.isAddress(element.address)) {
                return element.address
            }
        }
    } catch (err) {
        console.log(`Error reading file from disk: ${err}`);
    }
    return ''
}

// get the deposit message by txHash from L1
const depositMsgByHash = async (l1RpcProvider, hash, l1cdm) => {
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

// get the withdraw message by txHash from L1
const withdrawMsgByHash = async (l2RpcProvider, hash, l2cdm) => {
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

// time sleep
const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// hash cross-chain message
const hashCrossMsg = async (
    l2cdm,
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

const waitDepositSuccess = async (l1RpcProvider, depositHash, l1cdm, l2cdm) => {
    let totalTimeMs = 0
    const tick = Date.now()
    const msgs = await depositMsgByHash(l1RpcProvider, depositHash, l1cdm)
    const sender = msgs[0].sender
    const target = msgs[0].target
    const value = msgs[0].value
    const nonce = msgs[0].messageNonce
    const data = msgs[0].message
    const xDomainCalldataHash = await hashCrossMsg(
        l2cdm,
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

const waitRollupSuccess = async (l2RpcProvider, withdrawTxHash, l2cdm, rollup) => {
    const msgs = await withdrawMsgByHash(l2RpcProvider, withdrawTxHash, l2cdm)
    const withdrawNum = msgs[0].blockNumber
    const tick = Date.now()

    let totalTimeMs = 0
    while (totalTimeMs < Infinity) {
        const commitIndex = await rollup.lastCommittedBatchIndex()
        const batch = await rollup.committedBatchStores(commitIndex)
        const commitNum = batch.blockNumber
        if (commitNum >= withdrawNum) {
            console.log(`time ${Date.now()} rollup succeed! commit number ${commitNum} , withdraw number ${withdrawNum}`)
            return
        }
        console.log(`time ${Date.now()} wait rollup! commit number ${commitNum} , withdraw number ${withdrawNum}`)
        await sleep(8000)
        totalTimeMs += Date.now() - tick
    }
}

const waitBatchFinalize = async (l2RpcProvider, withdrawTxHash, l2cdm, rollup) => {
    const msgs = await withdrawMsgByHash(l2RpcProvider, withdrawTxHash, l2cdm)
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

const waitSyncSuccess = async (l2RpcProvider, withdrawTxHash, l2cdm) => {
    const msgs = await withdrawMsgByHash(l2RpcProvider, withdrawTxHash, l2cdm)
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

const provenAndRelayByHash = async (l2RpcProvider, hash, l1cdm, l2cdm) => {
    const msg = await withdrawMsgByHash(l2RpcProvider, hash, l2cdm)
    const sender = msg[0].sender
    const target = msg[0].target
    const value = msg[0].value
    const nonce = msg[0].messageNonce
    const data = msg[0].message

    const proofData = await getProofByNonce(nonce)
    const wdHash = await hashCrossMsg(
        l2cdm,
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
    res = await l1cdm.proveAndRelayMessage(
        sender,
        target,
        value,
        nonce,
        data,
        proofData.proof,
        proofData.root,
    )
    receipt = await res.wait()
    console.log(`Proven and Relay status ${receipt.status == 1}, txHash ${receipt.transactionHash}`)
}

module.exports = {
    getSyncNumber,
    sleep,
    getAddressByName,
    getProofByNonce,
    depositMsgByHash,
    withdrawMsgByHash,
    hashCrossMsg,
    waitDepositSuccess,
    waitRollupSuccess,
    waitBatchFinalize,
    waitSyncSuccess,
    provenAndRelayByHash
}
