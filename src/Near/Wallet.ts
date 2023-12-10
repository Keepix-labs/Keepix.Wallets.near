import {
  KeyPair,
  Account,
  keyStores,
  Connection,
  InMemorySigner,
  utils,
  transactions,
} from 'near-api-js'
import { generateSeedPhrase, parseSeedPhrase } from 'near-seed-phrase'
import crypto from 'crypto'
import { KeyStore } from 'near-api-js/lib/key_stores'
import {
  FT_MINIMUM_STORAGE_BALANCE,
  FT_REGISTRATION_DEPOSIT,
  FT_REGISTRATION_DEPOSIT_GAS,
  FT_STORAGE_DEPOSIT_GAS,
  FT_TRANSFER_GAS,
  HELPER_URL,
  SEND_NEAR_GAS,
  TOKEN_TRANSFER_DEPOSIT,
} from './config'
import BN from 'bn.js'

type NETWORK = 'testnet' | 'mainnet'

async function sendJson(method: string, url: string, json: any) {
  const response = await fetch(url, {
    method: method,
    body: method !== 'GET' ? JSON.stringify(json) : undefined,
    headers: {
      'Content-type': 'application/json; charset=utf-8',
    },
  })
  if (!response.ok) {
    const body = await response.text()
    let parsedBody

    throw new Error(body)
  }
  if (response.status === 204) {
    return null
  }
  return await response.json()
}

async function accountExists(
  connection: Connection | undefined,
  accountId: string,
) {
  if (!connection) return false
  const account = new Account(connection, accountId)
  try {
    await account.state()
    return true
  } catch (err: any) {
    if (err.toString().indexOf('does not exist while viewing') > -1) {
      return false
    }
    throw err
  }
}

function createPasswordHash(templateSecretKey: string, password: string) {
  const hash = crypto
    .createHash('sha256')
    .update(templateSecretKey + password, 'utf8')
    .digest('hex')
  return Buffer.from(hash.substring(0, 32), 'hex')
}

function formatUnits(balance: string, decimals: number) {
  const wholeStr = balance.substring(0, balance.length - decimals) || '0'
  const fractionStr = balance
    .substring(balance.length - decimals)
    .padStart(decimals, '0')

  return `${wholeStr}.${fractionStr}`.replace(/\.?0*$/, '')
}

async function genereateNewSeedPhrase({
  helper,
  accountId,
  publicKey,
}: {
  accountId: string
  publicKey: string
  helper?: string
}) {
  try {
    await sendJson('POST', `${helper}/account/seedPhraseAdded`, {
      accountId,
      publicKey,
    })
  } catch (err) {
    console.log(err)
    throw new Error('Failed to create wallet from seed phrase')
  }
}

async function getAccountIds(publicKey: string, helper: string) {
  return fetch(`${helper}/publicKey/${publicKey}/accounts`, {
    headers: {
      'X-requestor': 'near',
    },
  }).then((res) => res.json())
}

/**
 * Wallet class who respect the WalletLibraryInterface for Keepix
 */
export class Wallet {
  private wallet?: Account
  private mnemonic?: string
  private type?: string
  private keepixTokens?: { coins: any; tokens: any }
  private rpc?: any
  private accessKey?: KeyPair
  private keyStore?: KeyStore
  private connection?: Connection
  private accountId?: string
  private networkId?: string

  constructor() {}

  async init({
    networkId,
    password,
    mnemonic,
    secretKey,
    type,
    keepixTokens,
    rpc,
    secretKeyTemplate = 'by8kdJoJHu7uUkKfoaLd2J2Dp1q1TigeWMG123pHdu9UREqPcshCM223kWadm',
  }: {
    networkId: 'mainnet' | 'testnet'
    password?: string
    mnemonic?: string
    secretKey?: string
    type: string
    keepixTokens?: { coins: any; tokens: any } // whitelisted coins & tokens
    rpc?: any
    secretKeyTemplate?: string
  }) {
    this.type = type
    this.keepixTokens = keepixTokens
    this.rpc = rpc
    this.networkId = networkId

    const keyStore = new keyStores.InMemoryKeyStore()
    this.keyStore = keyStore
    this.connection = Connection.fromConfig({
      networkId,
      provider: { type: 'JsonRpcProvider', args: { url: rpc + '/' } },
      signer: new InMemorySigner(keyStore),
    })

    // from password
    if (password !== undefined) {
      const { seedPhrase, accountId, keyPair, account } =
        await this.recoverAccountPassword({
          password,
          secretKeyTemplate,
        })

      this.mnemonic = seedPhrase
      this.accountId = accountId
      this.accessKey = keyPair
      this.wallet = account

      return
    }
    // from mnemonic
    if (mnemonic !== undefined) {
      this.mnemonic = mnemonic
      const { accountId, keyPair, account } =
        await this.recoverAccountSeedPhrase({
          seedPhrase: mnemonic,
        })

      this.accountId = accountId
      this.accessKey = keyPair
      this.wallet = account

      return
    }
    // from secretKey only
    if (secretKey !== undefined) {
      const { account, accountId, keyPair } =
        await this.recoverAccountSecretKey({
          secretKey,
        })

      this.mnemonic = undefined
      this.accountId = accountId
      this.accessKey = keyPair
      this.wallet = account

      return
    }
    // Random

    const { account, accountId, keyPair, seedPhrase } =
      await this.genereateRandomAccount()

    this.mnemonic = seedPhrase
    this.accountId = accountId
    this.accessKey = keyPair
    this.wallet = account
  }

  // PUBLIC

  public getPrivateKey() {
    return this.accessKey?.toString()
  }

  public getMnemonic() {
    return this.mnemonic
  }

  public getAddress() {
    return this.wallet?.accountId
  }

  public async getProdiver() {
    return this.connection
  }

  public getConnectedWallet = async () => {
    return this.wallet
  }

  // always display the balance in 0 decimals like 1.01 ETH
  public async getCoinBalance(walletAddress?: string) {
    if (!this.connection) throw new Error('Not initialized')
    const account = walletAddress
      ? new Account(this.connection, walletAddress)
      : this.wallet

    try {
      const totalYocto = (await account?.getAccountBalance())?.total ?? '0'
      return utils.format.formatNearAmount(totalYocto)
    } catch (err) {
      return '0'
    }
  }

  // always display the balance in 0 decimals like 1.01 RPL
  public async getTokenBalance(tokenAddress: string, walletAddress?: string) {
    try {
      if (!this.connection || !this.wallet) throw new Error('Not initialized')
      const metadata = await this.wallet.viewFunction({
        contractId: tokenAddress,
        methodName: 'ft_metadata',
      })
      const balance = await this.wallet.viewFunction({
        contractId: tokenAddress,
        methodName: 'ft_balance_of',
        args: { account_id: walletAddress ?? this.wallet.accountId },
      })
      return formatUnits(balance, metadata.decimals)
    } catch (err) {
      console.log(err)
      return '0'
    }
  }

  public async estimateCostSendCoinTo(receiverAddress: string, amount: string) {
    const sendNearGas = new BN(SEND_NEAR_GAS)

    return this.getTotalGasFee(sendNearGas)
  }

  public async sendCoinTo(receiverAddress: string, amount: string) {
    try {
      if (!this.wallet) throw new Error('Not initialized')

      const tx = await this.wallet.sendMoney(
        receiverAddress,
        new BN(utils.format.parseNearAmount(amount) ?? '0'),
      )

      return { success: true, description: tx.transaction }
    } catch (err) {
      console.log(err)
      return { success: false, description: `Transaction failed: ${err}` }
    }
  }

  public async estimateCostSendTokenTo(
    tokenAddress: string,
    receiverAddress: string,
    amount: string,
  ) {
    try {
      const isRegistrationRequired =
        (await this.checkRegistration({
          contractName: tokenAddress,
          accountId: receiverAddress,
        })) === false
      const isStorageDepositRequired = await this.isStorageDepositRequired({
        contractName: tokenAddress,
        accountId: receiverAddress,
      })

      const transferGasFee = new BN(FT_TRANSFER_GAS)

      if (isRegistrationRequired) {
        const gasFeesWithStorage = await this.getTotalGasFee(
          transferGasFee.add(new BN(FT_REGISTRATION_DEPOSIT_GAS)),
        )
        return new BN(gasFeesWithStorage)
          .add(new BN(FT_REGISTRATION_DEPOSIT))
          .toString()
      }

      if (isStorageDepositRequired) {
        const gasFeesWithStorage = await this.getTotalGasFee(
          transferGasFee.add(new BN(FT_STORAGE_DEPOSIT_GAS)),
        )
        return new BN(gasFeesWithStorage)
          .add(new BN(FT_MINIMUM_STORAGE_BALANCE))
          .toString()
      }

      return this.getTotalGasFee(transferGasFee)
    } catch (err) {
      console.log(err)
      return '0'
    }
  }

  public async sendTokenTo(
    tokenAddress: string,
    receiverAddress: string,
    amount: string,
  ) {
    try {
      if (!this.wallet || !this.connection) throw new Error('Not initialized')

      const isStorageTransferRequired = await this.isStorageDepositRequired({
        accountId: receiverAddress,
        contractName: tokenAddress,
      })

      if (isStorageTransferRequired) {
        await this.transferStorageDeposit({
          contractName: tokenAddress,
          receiverId: receiverAddress,
          storageDepositAmount: FT_MINIMUM_STORAGE_BALANCE,
        })
      }

      const isRegistrationRequired =
        (await this.checkRegistration({
          accountId: receiverAddress,
          contractName: tokenAddress,
        })) === false

      const tx = await this.wallet.signAndSendTransaction({
        receiverId: tokenAddress,
        actions: [
          ...(isRegistrationRequired
            ? [
                transactions.functionCall(
                  'register_account',
                  { account_id: receiverAddress },
                  new BN(FT_REGISTRATION_DEPOSIT_GAS),
                  new BN(FT_REGISTRATION_DEPOSIT),
                ),
              ]
            : []),
          transactions.functionCall(
            'ft_transfer',
            {
              amount,
              receiver_id: receiverAddress,
            },
            new BN(FT_TRANSFER_GAS),
            new BN(TOKEN_TRANSFER_DEPOSIT),
          ),
        ],
      })

      return { success: true, description: tx.transaction }
    } catch (err) {
      console.log(err)
      return { success: false, description: `Transaction failed: ${err}` }
    }
  }

  private async genereateRandomAccount() {
    const { secretKey, seedPhrase } = generateSeedPhrase()

    const { account, accountId, keyPair } = await this.recoverAccountSecretKey({
      secretKey,
    })

    return { secretKey, seedPhrase, account, accountId, keyPair }
  }

  private async recoverAccountPassword({
    password,
    secretKeyTemplate,
  }: {
    password: string
    secretKeyTemplate: string
  }) {
    const passwordHash = createPasswordHash(secretKeyTemplate, password)
    const { seedPhrase } = generateSeedPhrase(passwordHash)
    return await this.recoverAccountSeedPhrase({ seedPhrase })
  }

  private async recoverAccountSeedPhrase({
    seedPhrase,
  }: {
    seedPhrase: string
  }) {
    const { secretKey } = parseSeedPhrase(seedPhrase)

    const { account, accountId, keyPair } = await this.recoverAccountSecretKey({
      secretKey,
    })

    return {
      seedPhrase,
      keyPair,
      account,
      accountId,
    }
  }

  private async recoverAccountSecretKey({ secretKey }: { secretKey: string }) {
    const keyPair = KeyPair.fromString(secretKey)
    const publicKey = keyPair.getPublicKey().toString()

    const accountIdsByPublickKey = await getAccountIds(
      publicKey,
      HELPER_URL[this.networkId as NETWORK],
    )

    const accountsSet = new Set(accountIdsByPublickKey)
    for (const accountId of accountsSet) {
      if (!(await accountExists(this.connection, accountId as string))) {
        accountsSet.delete(accountId)
      }
    }

    const accountIds = [...accountsSet]

    if (accountIds && accountIds.length > 0) {
      const accountId = accountIds[0] as string
      const keyStore = new keyStores.InMemoryKeyStore()
      keyStore.setKey(this.networkId as NETWORK, accountId, keyPair)
      this.connection = Connection.fromConfig({
        networkId: this.networkId,
        provider: { type: 'JsonRpcProvider', args: { url: this.rpc + '/' } },
        signer: new InMemorySigner(keyStore),
      })
      let account = new Account(this.connection, accountId)
      this.keyStore = keyStore
      return { keyPair, account, accountId }
    } else {
      const implicitAccountId = Buffer.from(
        keyPair.getPublicKey().data,
      ).toString('hex')

      try {
        await sendJson(
          'POST',
          `${HELPER_URL[this.networkId as NETWORK]}/account/seedPhraseAdded`,
          {
            accountId: implicitAccountId,
            publicKey: keyPair.getPublicKey().toString(),
          },
        )
      } catch (err: any) {
        if (err.message.includes('ConditionalCheckFailedException')) {
          console.log(
            `Public key ${keyPair
              .getPublicKey()
              .toString()} has previously been added as recovery method to account. Continuing setup...`,
          )
        } else {
          throw err
        }
      }

      const keyStore = new keyStores.InMemoryKeyStore()
      await keyStore.setKey(
        this?.networkId as NETWORK,
        implicitAccountId,
        keyPair,
      )

      this.keyStore = keyStore
      this.connection = Connection.fromConfig({
        networkId: this.networkId,
        provider: { type: 'JsonRpcProvider', args: { url: this.rpc + '/' } },
        signer: new InMemorySigner(keyStore),
      })

      let account = new Account(this.connection, implicitAccountId)

      return { keyPair, account, accountId: implicitAccountId }
    }
  }

  private async checkRegistration({
    accountId,
    contractName,
  }: {
    accountId: string
    contractName: string
  }) {
    if (!this.connection) throw new Error('Not initialized')
    const account = new Account(this.connection, 'viewfunction')
    try {
      return await account.viewFunction({
        contractId: contractName,
        methodName: 'check_registration',
        args: {
          account_id: accountId,
        },
      })
    } catch {
      return null
    }
  }

  private async isStorageDepositRequired({
    accountId,
    contractName,
  }: {
    accountId: string
    contractName: string
  }) {
    if (!this.connection) throw new Error('Not initialized')
    const account = new Account(this.connection, 'viewfunction')
    try {
      const storageBalance = await account.viewFunction({
        contractId: contractName,
        methodName: 'storage_balance_of',
        args: {
          account_id: accountId,
        },
      })
      return storageBalance?.total === undefined
    } catch {
      return false
    }
  }

  private async transferStorageDeposit({
    contractName,
    receiverId,
    storageDepositAmount,
  }: {
    contractName: string
    receiverId: string
    storageDepositAmount: string
  }) {
    return this.wallet?.signAndSendTransaction({
      receiverId: contractName,
      actions: [
        transactions.functionCall(
          'storage_deposit',
          {
            account_id: receiverId,
            registration_only: true,
          },
          new BN(FT_STORAGE_DEPOSIT_GAS),
          new BN(storageDepositAmount),
        ),
      ],
    })
  }
  
  private async getTotalGasFee(gas: BN) {
    const gasPrice =
      (await this.connection?.provider.block({ finality: 'final' }))?.header
        ?.gas_price ?? '0'

    return new BN(gasPrice).mul(gas).toString()
  }
}
