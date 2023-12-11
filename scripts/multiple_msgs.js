const ethers = require("ethers")
const morphSDK = require("@morph-l2/sdk")
const { expect } = require("chai")
const axios = require("axios")

const L1ERC20Artifacts = require("../artifacts/contracts/MockTest/TestERC20.sol/TestERC20.json")
const L2ERC20Artifacts = require("../artifacts/contracts/universal/MorphismMintableERC20.sol/MorphismMintableERC20.json")
const L1MultipleArtifacts = require("../artifacts/contracts/MockTest/TestL1Multiple.sol/TestL1Multiple.json")
const L2MultipleArtifacts = require("../artifacts/contracts/MockTest/TestL2Multiple.sol/TestL2Multiple.json")

const L2BridgeAddress = '0x4200000000000000000000000000000000000010'
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`

const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
let crossChainMessenger

const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'
const erc20Num = 3

let l1ERC20s = []
let l2ERC20s = []
let l1Multiple
let l2Multiple

let ourAddr             // The address of the signer we use.  
const dou = BigInt(2)
const oneToken = BigInt(1e18)

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)
    ourAddr = l1Wallet.address

    return [l1Wallet, l2Wallet]
}

const sendEther = async () => {
    console.log("send 3 ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E")
    const privateKey1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const walletL1 = new ethers.Wallet(privateKey1, l1RpcProvider)
    const walletL2 = new ethers.Wallet(privateKey1, l2RpcProvider)
    const signerL1 = new ethers.Wallet(privateKey, l1RpcProvider)
    const signerL2 = new ethers.Wallet(privateKey, l2RpcProvider)
    const tx = {
        to: '0xF1D598fD5f8367be41b0761696e643aC092b313E',
        value: ethers.utils.parseEther("100")
    }
    let l1Balance = (await signerL1.getBalance()).toString()
    let l2Balance = (await signerL2.getBalance()).toString()

    if (l1Balance.length < 20) {
        let receipt = await walletL1.sendTransaction(tx)
        await receipt.wait()
    }
    if (l2Balance.length < 20) {
        let receipt = await walletL2.sendTransaction(tx)
        await receipt.wait()
    }
    console.log('l1 balances', (await signerL1.getBalance()).toString())
    console.log('l2 balances', (await signerL2.getBalance()).toString())
}

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    crossChainMessenger = new morphSDK.CrossChainMessenger({
        l1ChainId: 900,
        l2ChainId: 53077,
        l1SignerOrProvider: l1Signer,
        l2SignerOrProvider: l2Signer,
    })
    await deployERC20s()
    await deployMultipleContract()
}

const deployERC20s = async () => {
    let [l1Wallet, l2Wallet] = await getSigners()
    const l1ERC20Factory = new ethers.ContractFactory(
        L1ERC20Artifacts.abi,
        L1ERC20Artifacts.bytecode,
    ).connect(l1Wallet)
    const l2ERC20Factory = new ethers.ContractFactory(
        L2ERC20Artifacts.abi,
        L2ERC20Artifacts.bytecode,
    ).connect(l2Wallet)

    for (let i = 0; i < erc20Num; i++) {
        let l1Name = `l1token${i}`
        let l2Name = `l2token${i}`
        let l1ERC20 = await l1ERC20Factory.deploy(l1Name, l1Name)
        let l2ERC20 = await l2ERC20Factory.deploy(L2BridgeAddress, l1ERC20.address, l2Name, l2Name)
        l1ERC20s.push(l1ERC20)
        l2ERC20s.push(l2ERC20)
        console.log(`Deploy token on L1 ${l1ERC20.address}, L2 ${l2ERC20.address}`)
        const l1Address = l1ERC20.address
        const l2Address = l2ERC20.address
        const addTokenPairUrl = `http://localhost:8080/addToList?l1Address=${l1Address}&l2Address=${l2Address}`;
        axios.get(addTokenPairUrl, {
            params: {
                l1Address: l1Address,
                l2Address: l2Address
            }
        })
            .then(response => {
                console.log("add to token list success")
            })
            .catch(error => {
                console.log(error);
            });
    }
}

const deployMultipleContract = async () => {
    let [l1Wallet, l2Wallet] = await getSigners()
    const l1MultipleFactory = new ethers.ContractFactory(
        L1MultipleArtifacts.abi,
        L1MultipleArtifacts.bytecode,
    ).connect(l1Wallet)
    // L2MultipleArtifacts
    const l2MultipleFactory = new ethers.ContractFactory(
        L2MultipleArtifacts.abi,
        L2MultipleArtifacts.bytecode,
    ).connect(l2Wallet)
    l1Multiple = await l1MultipleFactory.deploy(
        crossChainMessenger.contracts.l1.L1CrossDomainMessenger.address,
        crossChainMessenger.contracts.l1.L1StandardBridge.address,
        oneToken, // _erc20Amount
        ourAddr
    )
    l2Multiple = await l2MultipleFactory.deploy(
        crossChainMessenger.contracts.l2.L2CrossDomainMessenger.address,
        crossChainMessenger.contracts.l2.L2StandardBridge.address,
        oneToken, // _erc20Amount
        ourAddr
    )
}

const reportERC20Balances = async () => {
    for (let i = 0; i < l1ERC20s.length; i++) {
        const l1Balance = (await l1ERC20s[i].balanceOf(ourAddr)).toString()
        const l2Balance = (await l2ERC20s[i].balanceOf(ourAddr)).toString()
        console.log(`Token${i} on L1 balances:${l1Balance}     Token on L2 balances:${l2Balance}`)
    }
}

const reportETHBalances = async () => {
    const l1Balance = (await crossChainMessenger.l1Signer.getBalance()).toString().slice(0, -9)
    const l2Balance = (await crossChainMessenger.l2Signer.getBalance()).toString().slice(0, -9)

    console.log(`ETH On L1:${l1Balance} Gwei   On L2:${l2Balance} Gwei`)
}

const depositETH = async () => {
    console.log("Deposit ETH")
    await reportETHBalances()
    const start = new Date()

    const response = await crossChainMessenger.depositETH(dou * oneToken)
    console.log(`Transaction hash (on L1): ${response.hash}`)
    let rec = await response.wait()
    console.log("deposit at l1 height :", rec.blockNumber)
    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.RELAYED)
    console.log("finalize deposit at l2 height :", await l2RpcProvider.getBlockNumber())
    await reportETHBalances()
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds\n\n`)
}

const multipleDeposit = async () => {
    console.log("Multiple Deposit")
    const start = new Date()
    let l1tokens = []
    let l2tokens = []
    for (let i = 0; i < l1ERC20s.length; i++) {
        let res = await l1ERC20s[i].mint(ourAddr, dou * oneToken)
        await res.wait()
        res = await l1ERC20s[i].transfer(l1Multiple.address, oneToken)
        await res.wait()
        expect((await l1ERC20s[i].balanceOf(l1Multiple.address)).toString()).to.eq(oneToken.toString())

        l1tokens.push(l1ERC20s[i].address)
        l2tokens.push(l2ERC20s[i].address)
        console.log(`${i} pre transfer success`)
    }
    await reportERC20Balances()
    await reportETHBalances()
    const response = await l1Multiple.sendDeposit(
        l1tokens,
        l2tokens,
        oneToken,
        200_000,
        '0x',
        {
            gasLimit: 10000_000,
            value: dou * oneToken
        }
    )
    let rec = await response.wait()
    console.log("withdraw at l2 height:", rec.blockNumber)
    console.log("Waiting for status to change to RELAYED")

    await reportERC20Balances()
    await reportETHBalances()
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
}

const multipleWithdraw = async () => {
    console.log("Multiple Withdraw")
    await reportERC20Balances()
    await reportETHBalances()
    const start = new Date()
    let l1tokens = []
    let l2tokens = []
    for (let i = 0; i < l2ERC20s.length; i++) {
        const res = await l2ERC20s[i].transfer(l2Multiple.address, oneToken)
        await res.wait()
        expect((await l2ERC20s[i].balanceOf(l2Multiple.address)).toString()).to.eq(oneToken.toString())

        l1tokens.push(l1ERC20s[i].address)
        l2tokens.push(l2ERC20s[i].address)
        console.log(`${i} pre transfer success`)
    }

    const res = await l2Multiple.sendWithdrawal(
        l1tokens,
        l2tokens,
        oneToken,
        200_000,
        '0x',
        {
            gasLimit: 10000_000,
            value: dou * oneToken
        }
    )
    await res.wait()
    await reportERC20Balances()
    await reportETHBalances()
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
}

const main = async () => {
    await sendEther()
    await setup()
    for (let i = 0; i < 1024; i++) {
        console.log(`--------------------------- ${i} ------------------------`)
        await multipleDeposit()
        await depositETH()
        await multipleWithdraw()
    }
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })