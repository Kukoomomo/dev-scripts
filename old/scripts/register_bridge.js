const ethers = require("ethers")
const { expect } = require("chai")
const morphSDK = require("@morph-l2/sdk")

const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
const GovArtifacts = require("../artifacts/contracts/L2/Gov.sol/Gov.json")
const StakingArtifacts = require("../artifacts/contracts/L1/staking/Staking.sol/Staking.json")
const L1SequencerArtifacts = require("../artifacts/contracts/L1/staking/L1Sequencer.sol/L1Sequencer.json")
const L2SequencerArtifacts = require("../artifacts/contracts/L2/L2Sequencer.sol/L2Sequencer.json")

const StakingProxyAddr = '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707'
const L1SequencerProxyAddr = '0x0165878a594ca255338adfa4d48449f69242eb8f'
const L2SequencerProxyAddr = '0x5300000000000000000000000000000000000003'
const L2GovProxyAddr = '0x5300000000000000000000000000000000000004'

const walletPrvKey = [
    '0x34062421ad51c048b1b7c13307a4518e45df10b61f9dc6cb9d700212585759af',
    '0xcba06bc82225a21a8033ea0aaea5fa93bf8ef08f3eaeb520abb6064025ffda32',
    '0xfc32c6688677b3f6e05252535b8e29577d10f0833bd8be9cfeaa7fcd546473e0',
    '0x9cfdcbb2bb8901b2970ac7428fb86fbebf76ae77999c5064da9edc77a9b0cf9b',
    '0x4d715b291b6829f04b29bdf46adae06194b15919a214ae86b2ffc9823268a661',
    '0xc8d8010a8f99cc24c194359e1c8003e3d004aff583c12993df02c945625fcc0d',
    '0x0798e6c097cc027f511ade26d5dec7a809b9b50bb73b922bf350abd5b5f6c332',
    '0xbead89c1a174d2e5fd5b53117a28c2c7be33e572970a3bc7a95e269d28fecd19',
    '0xb71ec7b99f151a02fd751a7b797ca386b30de9568719633c7750d5f2919422c2',
    '0x187411ee1567e26e82492b4f8ea8ab29f8d2b9375442a8bcfe6937d31557ba6e'
]

let GovContract
let StakingContract
let L1SequencerContract
let L2SequencerContract
let crossChainMessenger
let crossChainHash

const privateKey1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const balanceWalletL1 = new ethers.Wallet(privateKey1, l1RpcProvider)
const balanceWalletL2 = new ethers.Wallet(privateKey1, l2RpcProvider)

let l1Wallets = []
let l2Wallets = []

const tre = BigInt(3)
const dou = BigInt(2)
const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18
let sequencerLen = 3

const setupContracts = async () => {
    StakingContract = new ethers.Contract(
        StakingProxyAddr,
        StakingArtifacts.abi,
        l1RpcProvider
    )
    L1SequencerContract = new ethers.Contract(
        L1SequencerProxyAddr,
        L1SequencerArtifacts.abi,
        l1RpcProvider
    )
    L2SequencerContract = new ethers.Contract(
        L2SequencerProxyAddr,
        L2SequencerArtifacts.abi,
        l2RpcProvider
    )
    GovContract = new ethers.Contract(
        L2GovProxyAddr,
        GovArtifacts.abi,
        l2RpcProvider
    )
    const sequencersSize = await StakingContract.sequencersSize()
    sequencerLen = sequencersSize.toNumber()
    console.log("Sequencer size is", sequencerLen)
}

const setupWallets = async () => {
    for (var i = 0; i < sequencerLen; i++) {
        // gen l1Wallets 
        // const mnemonic = ethers.utils.entropyToMnemonic(ethers.utils.randomBytes(32))
        // const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic)
        // const wallet = new ethers.Wallet(hdNode.privateKey, l1RpcProvider)
        const l1Wallet = new ethers.Wallet(walletPrvKey[i], l1RpcProvider)
        const l2Wallet = new ethers.Wallet(walletPrvKey[i], l2RpcProvider)

        const l1Balance = await l1RpcProvider.getBalance(l1Wallet.address)
        const l2Balance = await l2RpcProvider.getBalance(l2Wallet.address)

        const [tmkey, blsKey] = await genTmKeyAndBLSKey(l1Wallet.address)
        let l1SequencerInfo = {
            wallet: l1Wallet,
            tmKey: tmkey,
            blsKey: blsKey,
        }
        let l2SequencerInfo = {
            wallet: l2Wallet,
            tmKey: tmkey,
            blsKey: blsKey,
        }
        l1Wallets.push(l1SequencerInfo)
        l2Wallets.push(l2SequencerInfo)
        const tx = {
            to: l1Wallet.address,
            value: ethers.utils.parseEther('6')
        }
        if (l1Balance.isZero()) {
            const receipt = await balanceWalletL1.sendTransaction(tx)
            await receipt.wait()
            console.log('wallet in l1', l1Wallet.address, 'has balances', (await l1Wallet.getBalance()).toString())
        }
        if (l2Balance.isZero()) {
            const receipt = await balanceWalletL2.sendTransaction(tx)
            await receipt.wait()
            console.log('wallet in l2', l2Wallet.address, 'has balances', (await l2Wallet.getBalance()).toString())
        }
    }
}

const setupSDK = async () => {
    crossChainMessenger = new morphSDK.CrossChainMessenger({
        l1ChainId: 900,
        l2ChainId: 53077,
        l1SignerOrProvider: l1Signer,
        l2SignerOrProvider: l2Signer,
    })
}

const genTmKeyAndBLSKey = async (address) => {
    let tmkey = ethers.utils.keccak256(address)
    let blsKey = ethers.utils.randomBytes(256)
    return [tmkey, blsKey]
}

const register = async () => {
    const newestVersion = await L1SequencerContract.connect(l1RpcProvider).newestVersion()
    if (newestVersion != 0) {
        console.log("already register, go staking")
        await stakingMore()
        return
    }
    for (var i = 0; i < l1Wallets.length; i++) {
        let wallet = l1Wallets[i].wallet
        let tmKey = l1Wallets[i].tmKey
        let blsKey = l1Wallets[i].blsKey
        if (i == 2) {
            const response = await StakingContract.connect(wallet).register(tmKey, blsKey, 5000000, {
                gasLimit: 10000000,
                value: dou * eth
            })
            console.log(`Transaction hash (on L1): ${response.hash}`)
            crossChainHash = response.hash
            const receipt = await response.wait()
            console.log('Transaction in L1 height', receipt.blockNumber)
        } else {
            const response = await StakingContract.connect(wallet).register(tmKey, blsKey, 0, {
                value: dou * eth
            })
            await response.wait()
        }
        const sequencerInfo = await StakingContract.stakings(wallet.address)
        expect(tmKey).to.eq(sequencerInfo.tmKey)
        const hexString = '0x' + Buffer.from(blsKey).toString('hex');
        expect(hexString).to.eq(sequencerInfo.blsKey)
    }
    await checkL1SequencerInfo()
    console.log("Waiting for status to change to RELAYED")
    await crossChainMessenger.waitForMessageStatus(crossChainHash, morphSDK.MessageStatus.RELAYED)
}

const stakingMore = async () => {
    let wallet = l1Wallets[0].wallet
    let tmKey = l1Wallets[0].tmKey
    let walletOther = l1Wallets[1].wallet

    const staker = await StakingContract.stakers(0)
    if (staker == l1Wallets[0].wallet.address) {
        console.log('use wallet1')
        wallet = l1Wallets[1].wallet
        tmKey = l1Wallets[1].tmKey
        walletOther = l1Wallets[0].wallet
    }
    const response = await StakingContract.connect(wallet).stakeETH(5000000, {
        gasLimit: 10000000,
        value: 1
    })
    await StakingContract.connect(walletOther).stakeETH(0, {
        gasLimit: 10000000,
        value: 1
    })
    console.log(`Transaction hash (on L1): ${response.hash}`)
    crossChainHash = response.hash
    const receipt = await response.wait()
    console.log('Transaction in L1 height', receipt.blockNumber)
    const sequencerInfo = await StakingContract.stakings(wallet.address)
    expect(tmKey).to.eq(sequencerInfo.tmKey)

    console.log("Waiting for status to change to RELAYED")
    await crossChainMessenger.waitForMessageStatus(crossChainHash, morphSDK.MessageStatus.RELAYED)
}

const checkL1SequencerInfo = async () => {
    const newVersion = await L1SequencerContract.newestVersion()
    for (let i = 0; i < sequencerLen; i++) {
        const blsKey = await L1SequencerContract.getSequencerBLSKeys(newVersion, i)
        const hexString = '0x' + Buffer.from(l1Wallets[i].blsKey).toString('hex');
        expect(blsKey).to.eq(hexString)
    }
}

const checkL2SequencerInfo = async () => {
    const newVersion = await L1SequencerContract.newestVersion()
    for (let i = 0; i < sequencerLen; i++) {
        const blsKeyL1 = await L1SequencerContract.getSequencerBLSKeys(newVersion, i)
        const address = await L2SequencerContract.sequencerAddresses(i)
        const info = await L2SequencerContract.sequencerInfos(i)
        expect(info.addr).to.eq(address)
        expect(info.blsKey).to.eq(blsKeyL1)
    }
    console.log("Check L2 sequencer info success")
}

const proposeAndVote = async () => {
    console.log('Gov start propose')
    const batchTimeout = await GovContract.batchTimeout()
    let proposalData = {
        batchBlockInterval: 1000,
        batchMaxBytes: 0,
        batchTimeout: batchTimeout.toNumber() + 1,
    }
    const tx = await GovContract.connect(l2Wallets[0].wallet).propose(proposalData)
    await tx.wait()
    // sequencersVersion
    let proposalNumber = await GovContract.proposalNumbers()
    for (var i = 0; i <= (sequencerLen * 2) / 3; i++) {
        const response = await GovContract.connect(l2Wallets[i].wallet).vote(proposalNumber)
        await response.wait()
    }
}

const govCheck = async () => {
    let proposalNumber = await GovContract.proposalNumbers()
    let batchTimeout = await GovContract.batchTimeout()
    expect(proposalNumber.toNumber()).to.eq(batchTimeout.toNumber())
}

const main = async () => {
    await setupContracts()
    await setupWallets()
    await setupSDK()
    await register()
    await checkL2SequencerInfo()
    await proposeAndVote()
    await govCheck()
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
