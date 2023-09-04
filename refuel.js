import fs from "fs";
import {
    wait,
    sleep,
    random,
    readWallets,
    writeLineToFile,
    polygonProvider,
    bnbProvider,
    arbitrumProvider,
    optimismProvider,
    getUsdValue,
    randomFloatInRange,
    polygonContractAddress,
    arbitrumContractAddress,
    optimismContractAddress,
    arbitrumNetworkId,
    polygonNetworkId,
    optimismNetworkId
} from './common.js'
import * as ethers from "ethers"
import axios from "axios"

const args = process.argv.slice(2)
let sourceNetworks = ['polygon', 'arbitrum', 'optimism']
let destinationNetwork = 'zora'
let sum = 1;
let sumFrom = null, sumTo = null
let isRandom = false
let destChainId = 195

if (args[0]) {
   sum = args[0];
   if (sum.includes('-')) {
       [sumFrom, sumTo] = sum.split('-')
       isRandom = true
   }
}

if (args.length > 1) {
    sourceNetworks = args[1].split(',')
    if (args[2]) {
        destinationNetwork = args[2]
    }
}


console.log(`Ищем газ в сетях: ${String(sourceNetworks)}`)
console.log(`Refuel в сеть: ${destinationNetwork}`)

let polygonPrice = 0
let bnbPrice = 0
let ethPrice = 0
await axios.get('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD').then(response => {
    ethPrice = response.data.USD
})

await axios.get('https://min-api.cryptocompare.com/data/price?fsym=MATIC&tsyms=USD').then(response => {
    polygonPrice = response.data.USD
})

await axios.get('https://min-api.cryptocompare.com/data/price?fsym=BNB&tsyms=USD').then(response => {
    bnbPrice = response.data.USD
})

const abi = JSON.parse(fs.readFileSync(`./abi.json`))

async function defineSourceNetwork(wallet) {
    let balance = { polygon: 0, bnb: 0, arbitrum: 0, optimism: 0}

    for (const network of sourceNetworks) {
        switch (network) {
            case "polygon":
                balance['polygon'] = getUsdValue(await polygonProvider.getBalance(wallet), polygonPrice)
                break
            case "bnb":
                balance['bnb'] = getUsdValue(await bnbProvider.getBalance(wallet), bnbPrice)
                break
            case "arbitrum":
                balance['arbitrum'] = getUsdValue(await arbitrumProvider.getBalance(wallet), ethPrice)
                break
            case "optimism":
                balance['optimism'] = getUsdValue(await optimismProvider.getBalance(wallet), ethPrice)
                break
        }
    }

    let topNetwork = null
    let topBalance = -Infinity

    for (const key in balance) {
        if (balance.hasOwnProperty(key)) {
            const currentBalance = balance[key]
            if (currentBalance > topBalance) {
                topBalance = currentBalance
                topNetwork = key
            }
        }
    }

    return {topNetwork, topBalance}
}

async function refuel(privateKey, network, sum) {
    let wallet, contractAddress, ethAmountToReceive, provider, maxFeePerGas, maxPriorityFeePerGas, gasLimit, networkId, feeData

    switch (network) {
        case "polygon":
            wallet = new ethers.Wallet(privateKey, polygonProvider)
            provider = polygonProvider
            contractAddress = polygonContractAddress
            networkId = polygonNetworkId
            gasLimit = 600000
            feeData = await provider.getFeeData()
            maxFeePerGas = Number(feeData.maxFeePerGas) * 1.5
            maxPriorityFeePerGas = 50500000000
            break
        case "optimism":
            wallet = new ethers.Wallet(privateKey, optimismProvider)
            provider = optimismProvider
            contractAddress = optimismContractAddress
            networkId = optimismNetworkId
            gasLimit = 400000
            feeData = await provider.getFeeData()
            maxFeePerGas = 185
            maxPriorityFeePerGas = 20
            break
        case "arbitrum":
            wallet = new ethers.Wallet(privateKey, arbitrumProvider)
            provider = arbitrumProvider
            contractAddress = arbitrumContractAddress
            networkId = arbitrumNetworkId
            gasLimit = 1200000
            feeData = await provider.getFeeData()
            maxFeePerGas = 105000000
            maxPriorityFeePerGas = 10000000
            break
    }

    const contract = new ethers.Contract(contractAddress, abi, wallet)

    ethAmountToReceive = (sum / ethPrice).toFixed(5)

    const address = await wallet.getAddress()

    const amountWei = ethers.utils.parseEther(ethAmountToReceive.toString())

    let adapterParams = ethers.utils.solidityPack(
        ["uint16", "uint", "uint", "address"],
        [2, 200000, amountWei, address]
    )

    const estimateGasBridgeFeeResponse = await contract.functions.estimateGasBridgeFee(destChainId, false, adapterParams)
    const sendValue = estimateGasBridgeFeeResponse.nativeFee

    try {
        const nonce = await provider.getTransactionCount(address)
        const data = contract.interface.encodeFunctionData('bridgeGas', [
            destChainId,
            address,
            adapterParams
        ])

        const tx = {
            type: 2,
            chainId: networkId,
            to: contractAddress,
            data: data,
            nonce: nonce,
            gasLimit: gasLimit,
            value: sendValue,
            maxFeePerGas: maxFeePerGas,
            maxPriorityFeePerGas: maxPriorityFeePerGas,
        }

        const signedTx = await wallet.signTransaction(tx)
        const txResponse = await provider.sendTransaction(signedTx)
        console.log(`${address}:  ${ txResponse.hash }`)
    } catch (e) {
        console.log(`${address}: [ERROR] ${ e.toString() }`)
    }
}

const privateKeys = readWallets('private_keys.txt');

for (let privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, polygonProvider)
    const address = await wallet.getAddress()
    console.log(`${address}: Работаем с кошельком`)

    if (isRandom) {
        sum = randomFloatInRange(sumFrom, sumTo)
    }

    let {topNetwork, topBalance} = await defineSourceNetwork(address)

    console.log(`Сумма для Refuel - $${sum}`)
    console.log(`Топ баланс в сети ${topNetwork}: $${topBalance.toFixed(2)}`)

    if ((topBalance * 0.9) < sum) {
        console.log(`Топ баланса недостаточно для refuel, пропускаем`)
        continue
    }

    await refuel(privateKey, topNetwork, sum)

    await sleep(random(30, 100) * 1000)
}