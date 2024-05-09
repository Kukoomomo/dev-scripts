const ethers = require("ethers")
const {
    sleep,
    getAddressByName,
    waitDepositSuccess,
    waitRollupSuccess,
    waitBatchFinalize,
    waitSyncSuccess,
    provenAndRelayByHash
} = require('./utils')

// config 
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)

const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'

// contract address
const L1GRAddr = getAddressByName('Proxy__L1GatewayRouter')
const L2GRAddr = '0x5300000000000000000000000000000000000002'
const L1CDMAddr = getAddressByName('Proxy__L1CrossDomainMessenger')
const L2CDMAddr = '0x5300000000000000000000000000000000000007'
const L2MPAddr = '0x5300000000000000000000000000000000000001'
const RollupAddr = getAddressByName('Proxy__Rollup')

// params
const dou = BigInt(2)
const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18

var l1gr
var l2gr
var l1cdm
var l2cdm
var rollup

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

const depositETH = async () => {
    console.log("Deposit ETH")
    await reportBalances()
    const start = new Date()

    // deposit 1 ether use gasLimit 100000 and value 1.1 ether
    const res = await l1gr["depositETH(uint256,uint256)"](ethers.utils.parseEther('1'), 210000, { value: ethers.utils.parseEther('1.1') })
    const receipt = await res.wait()
    console.log(`Deposit status ${receipt.status == 1}, txHash ${receipt.transactionHash}`)
    await waitDepositSuccess(l1RpcProvider, receipt.transactionHash, l1cdm, l2cdm)
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds\n\n`)
}

const withdrawETH = async () => {
    console.log("Withdraw ETH")
    await reportBalances()
    const start = new Date()

    let res = await l2gr["withdrawETH(uint256,uint256)"](1000, 110000, { value: 1000 })
    let receipt = await res.wait()
    console.log(`Withdraw status ${receipt.status == 1}, txHash ${receipt.transactionHash},height ${receipt.blockNumber}`)
    await waitRollupSuccess(l2RpcProvider, receipt.transactionHash, l2cdm, rollup)
    await waitBatchFinalize(l2RpcProvider, receipt.transactionHash, l2cdm, rollup)
    await waitSyncSuccess(l2RpcProvider, receipt.transactionHash, l2cdm, rollup)
    await provenAndRelayByHash(l2RpcProvider, receipt.transactionHash, l1cdm, l2cdm)
    console.log(`withdrawETH took ${(new Date() - start) / 1000} seconds\n\n`)
}

const main = async () => {
    await sendEther()
    await setup()
    for (let i = 0; i < 10; i++) {
        await sendEther()
        await depositETH()
        await withdrawETH()
    }
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
