const ethers = require("ethers")
const morphSDK = require("@morph-l2/sdk")

const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`

const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
let crossChainMessenger

const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
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
}


const main = async () => {
    await setup()
    const hash = '0xfe614327b64471c7973c9f1c80711306de01262fc3cf48a9f680775e854cd2d6'
    const status = await crossChainMessenger.getMessageStatus(hash)
    
    console.log(status)
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })