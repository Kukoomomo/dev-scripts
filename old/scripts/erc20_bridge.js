const ethers = require("ethers")
const morphSDK = require("@morph-l2/sdk")
const axios = require("axios")

const L1ERC20Artifacts = require("../artifacts/contracts/MockTest/TestERC20.sol/TestERC20.json")
const L2ERC20Artifacts = require("../artifacts/contracts/universal/MorphismMintableERC20.sol/MorphismMintableERC20.json")

const L2BridgeAddress = '0x4200000000000000000000000000000000000010'
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`

const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
let crossChainMessenger

const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'

const L1ERC20Addr = '0x0FaC7629f6B063733CE9A9d7c3917C9A8FFF67bc'
const L2ERC20Addr = '0x0FaC7629f6B063733CE9A9d7c3917C9A8FFF67bc'

let l1ERC20, l2ERC20    // OUTb contracts to show ERC-20 transfers
let ourAddr             // The address of the signer we use.  
const dou = BigInt(2)
const oneToken = BigInt(1e18)

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}

const deployERC20 = async () => {
    let [l1Wallet, l2Wallet] = await getSigners()
    const l1ERC20Factory = new ethers.ContractFactory(
        L1ERC20Artifacts.abi,
        L1ERC20Artifacts.bytecode,
    ).connect(l1Wallet)
    if (L1ERC20Addr == '') {
        l1ERC20 = await l1ERC20Factory.deploy('L1Token', 'l1token')
    } else {
        l1ERC20 = l1ERC20Factory.attach(L1ERC20Addr)
    }
    let res = await l1ERC20.mint(l1Wallet.address, dou * oneToken)
    await res.wait()

    const l2ERC20Factory = new ethers.ContractFactory(
        L2ERC20Artifacts.abi,
        L2ERC20Artifacts.bytecode,
    ).connect(l2Wallet)
    if (L2ERC20Addr == '') {
        l2ERC20 = await l2ERC20Factory.deploy(L2BridgeAddress, l1ERC20.address, "L2Token", "l2token")
    } else {
        l2ERC20 = l2ERC20Factory.attach(L2ERC20Addr)
    }
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


const sendEther = async () => {
    console.log("send ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E")
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
    ourAddr = l1Signer.address
    crossChainMessenger = new morphSDK.CrossChainMessenger({
        l1ChainId: 900,
        l2ChainId: 53077,
        l1SignerOrProvider: l1Signer,
        l2SignerOrProvider: l2Signer,
    })
    await deployERC20()
}

const reportERC20Balances = async () => {
    const l1Balance = (await l1ERC20.balanceOf(ourAddr)).toString()
    const l2Balance = (await l2ERC20.balanceOf(ourAddr)).toString()
    console.log(`Token on L1 balances:${l1Balance}     Token on L2 balances:${l2Balance}`)
}

const lockERC20ToL1SB = async () => {
    console.log("Lock ERC20")

    let [l1Wallet, l2Wallet] = await getSigners()
    const l1SBAddr = crossChainMessenger.contracts.l1.L1StandardBridge.address
    const res = await l1ERC20.connect(l1Wallet).transfer(l1SBAddr, oneToken)
    await res.wait()
    await reportERC20Balances()
}

const depositERC20 = async () => {
    console.log("Deposit ERC20")
    await reportERC20Balances()
    const start = new Date()

    // Need the l2 address to know which bridge is responsible
    const allowanceResponse = await crossChainMessenger.approveERC20(
        l1ERC20.address, l2ERC20.address, oneToken)
    await allowanceResponse.wait()
    console.log(`Allowance given by tx ${allowanceResponse.hash}`)
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)

    const response = await crossChainMessenger.depositERC20(
        l1ERC20.address, l2ERC20.address, oneToken)
    console.log(`Deposit transaction hash (on L1): ${response.hash}`)
    await response.wait()

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.RELAYED)

    await reportERC20Balances()
    console.log(`depositERC20 took ${(new Date() - start) / 1000} seconds\n\n`)
}

const withdrawERC20 = async () => {
    console.log("Withdraw ERC20")
    const start = new Date()
    await reportERC20Balances()

    const response = await crossChainMessenger.withdrawERC20(
        l1ERC20.address, l2ERC20.address, oneToken)
    console.log('withdraw in L2 height', await l2RpcProvider.getBlockNumber())
    console.log(`Transaction hash (on L2): ${response.hash}`)
    await response.wait()

    console.log("Waiting for status to be READY_TO_PROVE")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.READY_TO_PROVE)
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.proveMessage(response.hash)

    console.log("In the challenge period, waiting for status READY_FOR_RELAY")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.READY_FOR_RELAY)
    console.log("Ready for relay, finalizing message now")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)

    await crossChainMessenger.finalizeMessage(response.hash)

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response,
        morphSDK.MessageStatus.RELAYED)
    await reportERC20Balances()
    console.log(`withdrawERC20 took ${(new Date() - start) / 1000} seconds\n\n\n`)
}

const main = async () => {
    await sendEther()
    await setup()
    // await lockERC20ToL1SB()
    await depositERC20()
    // await withdrawERC20()
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })