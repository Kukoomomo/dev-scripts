const ethers = require("ethers")
const {
    getAddressByName,
    waitDepositSuccess,
    waitRollupSuccess,
    waitBatchFinalize,
    waitSyncSuccess,
    provenAndRelayByHash,
    addToTokenList
} = require('../utils')

// config
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)

const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'
const privateKey1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const walletL1 = new ethers.Wallet(privateKey1, l1RpcProvider)
const walletL2 = new ethers.Wallet(privateKey1, l2RpcProvider)

// contract address
const L1SGAddr = getAddressByName('Proxy__L1StandardERC20Gateway')
const L1GRAddr = getAddressByName('Proxy__L1GatewayRouter')
const L2GRAddr = '0x5300000000000000000000000000000000000002'
const L1CDMAddr = getAddressByName('Proxy__L1CrossDomainMessenger')
const L2CDMAddr = '0x5300000000000000000000000000000000000007'
const L2MPAddr = '0x5300000000000000000000000000000000000001'
const RollupAddr = getAddressByName('Proxy__Rollup')
const EmptyContractAddr = getAddressByName('Impl__EmptyContract')
const L1ProxyAdminAddr = getAddressByName('Impl__ProxyAdmin')
const L2ProxyAdminAddr = '0x530000000000000000000000000000000000000B'
const L2MorphAddr = '0x5300000000000000000000000000000000000013'

const L1ERC20Addr = ''
const L2ReverseCustomGatewayAddr = ''
const L1ReverseCustomGatewayAddr = ''

// params
const oneToken = BigInt(1e18)
let ourAddr             // The address of the signer we use.  

var l1gr
var l2gr
var l1cdm
var l2cdm
var rollup
var l1token
var l2token
var l1ReverseGateway
var l2ReverseGateway

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}

const sendEther = async () => {
    console.log("send 3 ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E")
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

const depositEther = async () => {
    const [l1Signer, l2Signer] = await getSigners()

    let l2Balance = (await l2Signer.getBalance()).toString()

    if (l2Balance.length < 18) {
        await depositETH()
    }
}

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    ourAddr = l1Signer.address

    const L1SGArtifacts = require("../contracts/l1/gateways/L1StandardERC20Gateway.sol/L1StandardERC20Gateway.json")
    const L1GRArtifacts = require("../contracts/l1/gateways/L1GatewayRouter.sol/L1GatewayRouter.json")
    const L1CDMArtifacts = require("../contracts/l1/L1CrossDomainMessenger.sol/L1CrossDomainMessenger.json")
    const L2GRArtifacts = require("../contracts/l2/gateways/L2GatewayRouter.sol/L2GatewayRouter.json")
    const L2CDMArtifacts = require("../contracts/l2/L2CrossDomainMessenger.sol/L2CrossDomainMessenger.json")
    const RollupArtifacts = require("../contracts/l1/rollup/Rollup.sol/Rollup.json")
    const L2MPArtifacts = require("../contracts/l2/system/L2ToL1MessagePasser.sol/L2ToL1MessagePasser.json")

    const MorphTokenArtifacts = require("../contracts/l2/system/MorphToken.sol/MorphToken.json")

    // L1 Factory
    const l1SGFactory = new ethers.ContractFactory(
        L1SGArtifacts.abi,
        L1SGArtifacts.bytecode,
    ).connect(l1Signer)
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
    l1sg = l1SGFactory.attach(L1SGAddr)
    l1gr = l1GRFactory.attach(L1GRAddr)
    l1cdm = l1CDMFactory.attach(L1CDMAddr)
    rollup = rollupFactory.attach(RollupAddr)
    l2gr = l2GRFactory.attach(L2GRAddr)
    l2cdm = l2CDMFactory.attach(L2CDMAddr)
    l2mp = l2MPFactory.attach(L2MPAddr)

    const MorphTokenFactory = new ethers.ContractFactory(
        MorphTokenArtifacts.abi,
        MorphTokenArtifacts.bytecode,
    ).connect(l2Signer)

    l2token = MorphTokenFactory.attach(L2MorphAddr).connect(l2Signer)

    let l2Balance = (await l2Signer.getBalance()).toString()
    if (l2Balance.length < 18) {
        await depositEther()
    }
    await transferMorphToken()
    await deployL1TokenAndGateways()

    console.log(`L1 Reverse Gateway ${l1ReverseGateway.address} , L2 Reverse Gateway ${l2ReverseGateway.address}`)
    console.log(`L1 Token ${l1token.address} , L2 Token ${l2token.address}`)

    await reportBalances()
}

const transferMorphToken = async () => {
    console.log("send 5 morph to 0xF1D598fD5f8367be41b0761696e643aC092b313E")
    const tokenOwnerKey = '0xb71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291'
    const walletL2 = new ethers.Wallet(tokenOwnerKey, l2RpcProvider)
    const signerL2 = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Balance = (await l2token.balanceOf(signerL2.address)).toString()
    if (l2Balance < 5) {
        let res = await l2token.connect(walletL2).transfer(signerL2.address, "5")
        await res.wait()
    }
    console.log('l2 balances', (await l2token.balanceOf(signerL2.address)).toString())
}

const deployL1TokenAndGateways = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    console.log("deploy L1Token and gateways")

    const EmptyContractArtifacts = require("../contracts/misc/EmptyContract.sol/EmptyContract.json")
    const IProxyArtifacts = require("../contracts/external/TransparentUpgradeableProxy.sol/ITransparentUpgradeableProxy.json")
    const ProxyArtifacts = require("../contracts/external/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json")
    const MorphStandardERC20Artifacts = require("../contracts/libraries/token/MorphStandardERC20.sol/MorphStandardERC20.json")
    const L1ReverseCustomGatewayArtifacts = require("../contracts/l1/gateways/L1ReverseCustomGateway.sol/L1ReverseCustomGateway.json")
    const L2ReverseCustomGatewayArtifacts = require("../contracts/l2/gateways/L2ReverseCustomGateway.sol/L2ReverseCustomGateway.json")

    const L1ProxyFactor = new ethers.ContractFactory(
        ProxyArtifacts.abi,
        ProxyArtifacts.bytecode,
    ).connect(l1Signer)
    const L1ReverseCustomGatewayFactory = new ethers.ContractFactory(
        L1ReverseCustomGatewayArtifacts.abi,
        L1ReverseCustomGatewayArtifacts.bytecode,
    ).connect(l1Signer)

    const L2ProxyFactor = new ethers.ContractFactory(
        ProxyArtifacts.abi,
        ProxyArtifacts.bytecode,
    ).connect(l2Signer)
    const L2ReverseCustomGatewayFactory = new ethers.ContractFactory(
        L2ReverseCustomGatewayArtifacts.abi,
        L2ReverseCustomGatewayArtifacts.bytecode,
    ).connect(l2Signer)
    const L2EmptyContractFactor = new ethers.ContractFactory(
        EmptyContractArtifacts.abi,
        EmptyContractArtifacts.bytecode,
    ).connect(l2Signer)
    const MorphStandardERC20Factory = new ethers.ContractFactory(
        MorphStandardERC20Artifacts.abi,
        MorphStandardERC20Artifacts.bytecode,
    ).connect(l1Signer)

    if (L1ERC20Addr === '') {
        const l2Empty = await L2EmptyContractFactor.deploy()
        await l2Empty.deployed()
        const l1GatewayProxy = await L1ProxyFactor.deploy(EmptyContractAddr, l1Signer.address, "0x")
        const l2GatewayProxy = await L2ProxyFactor.deploy(l2Empty.address, l2Signer.address, "0x")
        const l1TokenProxy = await L1ProxyFactor.deploy(EmptyContractAddr, l1Signer.address, "0x")
        await l1GatewayProxy.deployed()
        await l2GatewayProxy.deployed()
        await l1TokenProxy.deployed()

        const l1tokenImpl = await MorphStandardERC20Factory.deploy()
        await l1tokenImpl.deployed()
        const IL1TokenProxy = new ethers.Contract(
            l1TokenProxy.address,
            IProxyArtifacts.abi,
            l1Signer,
        )
        let res = await IL1TokenProxy.upgradeToAndCall(
            l1tokenImpl.address,
            MorphStandardERC20Factory.interface.encodeFunctionData('initialize', [
                "Morph L1 Token",
                "morph",
                18,
                l1GatewayProxy.address,
                L2MorphAddr
            ])
        )
        let rec = await res.wait()
        res = await IL1TokenProxy.changeAdmin(L1ProxyAdminAddr)
        await res.wait()
        l1token = new ethers.Contract(
            l1TokenProxy.address,
            MorphStandardERC20Artifacts.abi,
            l1Signer,
        )
        console.log(`upgrade L1Token ${rec.status == 1}`)

        const l1ReverseGatewayImpl = await L1ReverseCustomGatewayFactory.deploy()
        await l1ReverseGatewayImpl.deployed()
        const IL1ReverseProxy = new ethers.Contract(
            l1GatewayProxy.address,
            IProxyArtifacts.abi,
            l1Signer,
        )
        res = await IL1ReverseProxy.upgradeToAndCall(
            l1ReverseGatewayImpl.address,
            L1ReverseCustomGatewayFactory.interface.encodeFunctionData('initialize', [
                l2GatewayProxy.address,
                L1GRAddr,
                L1CDMAddr
            ])
        )
        rec = await res.wait()
        res = await IL1ReverseProxy.changeAdmin(L1ProxyAdminAddr)
        await res.wait()
        l1ReverseGateway = new ethers.Contract(
            l1GatewayProxy.address,
            L1ReverseCustomGatewayArtifacts.abi,
            l1Signer,
        )
        console.log(`upgrade L1ReverseCustomGateway ${rec.status == 1}`)

        const l2ReverseGatewayImpl = await L2ReverseCustomGatewayFactory.deploy()
        await l2ReverseGatewayImpl.deployed()
        const IL2ReverseProxy = new ethers.Contract(
            l2GatewayProxy.address,
            IProxyArtifacts.abi,
            l2Signer,
        )
        res = await IL2ReverseProxy.upgradeToAndCall(
            l2ReverseGatewayImpl.address,
            L2ReverseCustomGatewayFactory.interface.encodeFunctionData('initialize', [
                l1GatewayProxy.address,
                L2GRAddr,
                L2CDMAddr
            ])
        )
        rec = await res.wait()
        res = await IL2ReverseProxy.changeAdmin(L2ProxyAdminAddr)
        await res.wait()
        l2ReverseGateway = new ethers.Contract(
            l2GatewayProxy.address,
            L2ReverseCustomGatewayArtifacts.abi,
            l2Signer,
        )
        console.log(`upgrade L2ReverseCustomGateway ${rec.status == 1}`)
        // update token mapping
        res = await l1ReverseGateway.updateTokenMapping(l1token.address, l2token.address)
        await res.wait()
        res = await l2ReverseGateway.updateTokenMapping(l2token.address, l1token.address)
        await res.wait()
        console.log(`update token mapping success`)

        // set gateway to router
        res = await l1gr.connect(walletL1).setERC20Gateway([l1token.address], [l1ReverseGateway.address])
        await res.wait()
        res = await l2gr.connect(walletL2).setERC20Gateway([l2token.address], [l2ReverseGateway.address])
        await res.wait()
        console.log(`set gateway to router success`)
    } else {
        l1token = MorphStandardERC20Factory.attach(L1ERC20Addr)
        l1ReverseGateway = L1ReverseCustomGatewayFactory.attach(L1ReverseCustomGatewayAddr)
        l2ReverseGateway = L2ReverseCustomGatewayFactory.attach(L2ReverseCustomGatewayAddr)
    }
}

const reportERC20Balances = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    const l1Balance = (await l1token.balanceOf(l1Signer.address)).toString()
    const l2Balance = (await l2token.balanceOf(l1Signer.address)).toString()
    console.log(`Token on L1 balances:${l1Balance}     Token on L2 balances:${l2Balance}`)
}

const reportBalances = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    const l1Balance = (await l1Signer.getBalance()).toString().slice(0, -9)
    const l2Balance = (await l2Signer.getBalance()).toString().slice(0, -9)

    console.log(`ethers On L1:${l1Balance} Gwei   On L2:${l2Balance} Gwei`)
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
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds`)
}

const ERC20Mint = async () => {
    // mint l1 token
    const l1Balance = (await l1token.balanceOf(ourAddr)).toString()
    if (l1Balance.length < 19) {
        let res = await l1token.mint(ourAddr, oneToken)
        let rec = await res.wait()
        const balance = await l1token.balanceOf(ourAddr)
        console.log(`mint ${rec.status == 1}: ${ourAddr} has balance ${balance}`)
    }
}

const depositERC20 = async () => {
    console.log("Deposit ERC20")
    await reportBalances()
    const start = new Date()

    // approve
    let res = await l1token.approve(l1gr.address, 1)
    let rec = await res.wait()
    const allowance = await l1token.allowance(ourAddr, l1gr.address)
    console.log(`approve ${rec.status == 1}: router ${l1gr.address} has allowance ${allowance}`)

    // deposit with 1 use gasLimit 100000 and value 1 ether
    res = await l1gr["depositERC20(address,uint256,uint256)"](l1token.address, 1, 420000, { value: ethers.utils.parseEther('1') })
    rec = await res.wait()
    console.log(`Deposit status ${rec.status == 1}, txHash ${rec.transactionHash}`)
    await waitDepositSuccess(l1RpcProvider, rec.transactionHash, l1cdm, l2cdm)
    await reportERC20Balances()
    console.log(`depositERC20 took ${(new Date() - start) / 1000} seconds\n\n`)
}

const withdrawERC20 = async () => {
    console.log("Withdraw ERC20")
    await reportERC20Balances()
    const start = new Date()

    // approve
    let res = await l2token.approve(l2gr.address, 1)
    let rec = await res.wait()
    const allowance = await l2token.allowance(ourAddr, l2gr.address)
    console.log(`approve ${rec.status == 1}: router ${l2gr.address} has allowance ${allowance}`)

    // withdraw
    res = await l2gr["withdrawERC20(address,uint256,uint256)"](l2token.address, 1, 110000, { value: 0 })
    rec = await res.wait()
    console.log(`Withdraw status ${rec.status == 1}, txHash ${rec.transactionHash},height ${rec.blockNumber}`)
    await waitRollupSuccess(l2RpcProvider, rec.transactionHash, l2cdm, rollup)
    await waitSyncSuccess(l2RpcProvider, rec.transactionHash, l2cdm)
    await waitBatchFinalize(l2RpcProvider, rec.transactionHash, l2cdm, rollup)
    await provenAndRelayByHash(l2RpcProvider, rec.transactionHash, l1cdm, l2cdm)
    await reportERC20Balances()
    console.log(`withdrawERC20 took ${(new Date() - start) / 1000} seconds\n\n`)
}

const main = async () => {
    await sendEther()
    await setup()
    for (let i = 0; i < 100; i++) {
        await withdrawERC20()
        await depositERC20()
    }
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
