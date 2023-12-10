import { Wallet } from './Wallet'

describe('basic wallet', () => {
  it('can generate same wallet', async () => {
    const mnemonic =
      'matter alone layer giggle type yard energy doll toilet soldier sweet fabric'
    const secretKey =
      'ed25519:2eBxDnmPeepTgsHjpHKikNGaoPrndT8BEb5CGnp8vGDPjwdFuVJYBuhaq2ZkswMDYu1hRor2pZouEUzksEYSBLYT'
    const address =
      '490e50d78e3419a27a767f504fafcab6741191f83ebc3190c9520cdd5e2e728c'
    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      password: '123',
    })

    expect(wallet.getMnemonic()).toEqual(mnemonic)
    expect(wallet.getAddress()).toEqual(address)
    expect(wallet.getPrivateKey()).toEqual(secretKey)
  })

  it('can generate with Mnemonic', async () => {
    const mnemonic =
      'crazy disorder menu senior smooth mask apology shock draw chunk question vital'
    const secretKey =
      'ed25519:5EAXNvU4MpbqRjh269xj8KyvQ64QAQT35m3YfNst3EyLqNrHhy88MBvpP6HyCKnRsxMVbdndjbsjLPXDx7v9xKMi'
    const address = 'bbb1111.testnet'

    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      mnemonic,
    })

    expect(wallet.getAddress()).toEqual(address)
    expect(wallet.getPrivateKey()).toEqual(secretKey)
    expect(wallet.getMnemonic()).toEqual(mnemonic)
  })

  it('can generate with PrivateKey', async () => {
    const mnemonic = ''
    const secretKey =
      'ed25519:5EAXNvU4MpbqRjh269xj8KyvQ64QAQT35m3YfNst3EyLqNrHhy88MBvpP6HyCKnRsxMVbdndjbsjLPXDx7v9xKMi'
    const address = 'bbb1111.testnet'

    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      secretKey,
    })

    expect(wallet.getAddress()).toEqual(address)
    expect(wallet.getPrivateKey()).toEqual(secretKey)
    expect(wallet.getMnemonic()).toBe(undefined)
  })

  it('can generate with random', async () => {
    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
    })

    expect(wallet.getAddress()).toBeDefined()
    expect(wallet.getPrivateKey()).toBeDefined()
    expect(wallet.getMnemonic()).toBeDefined()
  })

  // const keepixTokens: any = {
  //       coins: {
  //           "ethereum": {
  //               "nativeCoinName": "ETH",
  //               "name": "Ethereum",
  //               "type": "evm",
  //               "icon": "./icons/ETH.png",
  //               "rpcs": [
  //                   {
  //                       "url": "https://mainnet.infura.io/v3/00e69497300347a38e75c3287621cb16",
  //                       "chainId": 1
  //                   }
  //               ],
  //               "getPriceByPoolBalance": {
  //                   "tokenA": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  //                   "tokenB": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  //                   "tokenADecimals": 18,
  //                   "tokenBDecimals": 18,
  //                   "poolAddress": "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11",
  //                   "blockchain": "ethereum"
  //               }
  //           }
  //       }
  //   };

  it('can getBalance', async () => {
    const mnemonic =
      'crazy disorder menu senior smooth mask apology shock draw chunk question vital'

    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      mnemonic,
    })
    expect(await wallet.getCoinBalance()).toEqual(
      '209.895673372731399899999998',
    )
  })

  it('can getTokenBalance', async () => {
    const mnemonic =
      'crazy disorder menu senior smooth mask apology shock draw chunk question vital'

    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      mnemonic,
    })
    expect(
      await wallet.getTokenBalance(
        'laycon.41c17b3a8dfac477986atokenlauncher.testnet',
      ),
    ).toEqual('0')
  })

  it('can estimate sendCoin', async () => {
    const mnemonic =
      'crazy disorder menu senior smooth mask apology shock draw chunk question vital'

    const wallet = new Wallet()

    await wallet.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      mnemonic,
    })
    const result = await wallet.sendCoinTo('aaa1111.testnet', '300')
    expect(result.success).toBe(false)
    // expect(estimationResult.description).toMatch('insufficient funds')
  })

  it('can estimate sendToken', async () => {
    const mnemonic =
      'crazy disorder menu senior smooth mask apology shock draw chunk question vital'

    const mnemonic1 =
      'youth family reward glue movie only version renew cousin dumb mango spider'

    const wallet1 = new Wallet()

    await wallet1.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      mnemonic,
    })

    const wallet2 = new Wallet()

    await wallet2.init({
      networkId: 'testnet',
      type: 'near',
      rpc: 'https://rpc.testnet.near.org',
      mnemonic: mnemonic1,
    })

    const beforeBalance1 = await wallet1.getTokenBalance('usdc.spin-fi.testnet')
    const beforeBalance2 = await wallet2.getTokenBalance('usdc.spin-fi.testnet')

    const result = await wallet2.sendTokenTo(
      'usdc.spin-fi.testnet',
      wallet1.getAddress() ?? '',
      '10000',
    )

    const afterBalance1 = await wallet1.getTokenBalance('usdc.spin-fi.testnet')
    const afterBalance2 = await wallet2.getTokenBalance('usdc.spin-fi.testnet')

    expect(result.success).toBe(true)
    expect(Number(afterBalance1) - Number(beforeBalance1)).toEqual(100)
    expect(Number(beforeBalance2) - Number(afterBalance2)).toEqual(100)
  }, 100000)
})
