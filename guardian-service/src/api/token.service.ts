import { Token } from '@entity/token';
import { MongoEntityRepository } from '@mikro-orm/mongodb';
import { KeyType, Wallet } from '@helpers/wallet';
import { Users } from '@helpers/users';
import { HederaSDKHelper } from '@hedera-modules';
import { ApiResponse } from '@api/api-response';
import { MessageBrokerChannel, MessageResponse, MessageError, Logger, DataBaseHelper } from '@guardian/common';
import { MessageAPI, IToken } from '@guardian/interfaces';
import { emptyNotifier, initNotifier, INotifier } from '@helpers/notifier';

/**
 * Get token info
 * @param info
 * @param token
 */
function getTokenInfo(info: any, token: any) {
    const tokenId = token.tokenId;
    const result: any = {
        id: token.id,
        tokenId: token.tokenId,
        tokenName: token.tokenName,
        tokenSymbol: token.tokenSymbol,
        tokenType: token.tokenType,
        decimals: token.decimals,
        policies: null,
        associated: false,
        balance: null,
        hBarBalance: null,
        frozen: null,
        kyc: null
    }
    if (info && info[tokenId]) {
        result.associated = true;
        result.balance = info[tokenId].balance;
        result.hBarBalance = info[tokenId].hBarBalance;
        result.frozen = !!info[tokenId].frozen;
        result.kyc = !!info[tokenId].kyc;
        try {
            if (result.decimals) {
                result.balance = (
                    result.balance / Math.pow(10, result.decimals)
                ).toFixed(result.decimals)
            }
        } catch (error) {
            result.balance = 'N/A';
        }
    }
    return result;
}

/**
 * Create token
 * @param token
 * @param owner
 * @param tokenRepository
 * @param notifier
 */
async function createToken(token: any, owner: any, tokenRepository: DataBaseHelper<Token>, notifier: INotifier): Promise<Token> {
    const {
        changeSupply,
        decimals,
        enableAdmin,
        enableFreeze,
        enableKYC,
        enableWipe,
        initialSupply,
        tokenName,
        tokenSymbol,
        tokenType
    } = token;

    if (!tokenName) {
        throw new Error('Invalid Token Name');
    }

    if (!tokenSymbol) {
        throw new Error('Invalid Token Symbol');
    }

    notifier.start('Resolve Hedera account');
    const users = new Users();
    const root = await users.getHederaAccount(owner);

    notifier.completedAndStart('Create token');
    const client = new HederaSDKHelper(root.hederaAccountId, root.hederaAccountKey);
    const treasury = client.newTreasury(root.hederaAccountId, root.hederaAccountKey);
    const treasuryId = treasury.id;
    const treasuryKey = treasury.key;
    const adminKey = enableAdmin ? treasuryKey : null;
    const kycKey = enableKYC ? treasuryKey : null;
    const freezeKey = enableFreeze ? treasuryKey : null;
    const wipeKey = enableWipe ? treasuryKey : null;
    const supplyKey = changeSupply ? treasuryKey : null;
    const nft = tokenType === 'non-fungible';
    const _decimals = nft ? 0 : decimals;
    const _initialSupply = nft ? 0 : initialSupply;
    const tokenId = await client.newToken(
        tokenName,
        tokenSymbol,
        nft,
        _decimals,
        _initialSupply,
        '',
        treasury,
        adminKey,
        kycKey,
        freezeKey,
        wipeKey,
        supplyKey,
    );
    notifier.completedAndStart('Save token in DB');
    const tokenObject = tokenRepository.create({
        tokenId,
        tokenName,
        tokenSymbol,
        tokenType,
        decimals: _decimals,
        initialSupply: _initialSupply,
        adminId: treasuryId ? treasuryId.toString() : null,
        adminKey: adminKey ? adminKey.toString() : null,
        kycKey: kycKey ? kycKey.toString() : null,
        freezeKey: freezeKey ? freezeKey.toString() : null,
        wipeKey: wipeKey ? wipeKey.toString() : null,
        supplyKey: supplyKey ? supplyKey.toString() : null,
        owner: root.did
    });
    const result = await tokenRepository.save(tokenObject);
    notifier.completed();
    return result;
}

/**
 * Associate/dissociate token
 * @param tokenId
 * @param did
 * @param associate
 * @param tokenRepository
 * @param notifier
 */
async function associateToken(tokenId: any, did: any, associate: any, tokenRepository: DataBaseHelper<Token>, notifier: INotifier): Promise<boolean> {
    notifier.start('Find token data');
    const token = await tokenRepository.findOne({ where: { tokenId: { $eq: tokenId } } });
    if (!token) {
        throw new Error('Token not found');
    }

    const wallet = new Wallet();
    const users = new Users();
    notifier.completedAndStart('Resolve Hedera account');
    const user = await users.getUserById(did);
    const userID = user.hederaAccountId;
    const userDID = user.did;
    const userKey = await wallet.getKey(user.walletToken, KeyType.KEY, userDID);
    if (!user) {
        throw new Error('User not found');
    }

    if (!user.hederaAccountId) {
        throw new Error('User is not linked to an Hedera Account');
    }

    notifier.completedAndStart(associate ? 'Associate' : 'Dissociate');
    const client = new HederaSDKHelper(userID, userKey);
    let status: boolean;
    if (associate) {
        status = await client.associate(tokenId, userID, userKey);
    } else {
        status = await client.dissociate(tokenId, userID, userKey);
    }

    notifier.completed();
    return status;
}

/**
 * Grant/revoke KYC
 * @param tokenId
 * @param username
 * @param owner
 * @param grant
 * @param tokenRepository
 * @param notifier
 */
async function grantKycToken(tokenId, username, owner, grant, tokenRepository: DataBaseHelper<Token>, notifier: INotifier): Promise<any> {
    notifier.start('Find token data');
    const token = await tokenRepository.findOne({ where: { tokenId: { $eq: tokenId } } });
    if (!token) {
        throw new Error('Token not found');
    }

    notifier.completedAndStart('Resolve Hedera account');
    const users = new Users();
    const user = await users.getUser(username);
    if (!user) {
        throw new Error('User not found');
    }
    if (!user.hederaAccountId) {
        throw new Error('User is not linked to an Hedera Account');
    }

    const root = await users.getHederaAccount(owner);
    const client = new HederaSDKHelper(root.hederaAccountId, root.hederaAccountKey);
    const kycKey = token.kycKey;
    notifier.completedAndStart(grant ? 'Grant KYC' : 'Revoke KYC');
    if (grant) {
        await client.grantKyc(tokenId, user.hederaAccountId, kycKey);
    } else {
        await client.revokeKyc(tokenId, user.hederaAccountId, kycKey);
    }

    const info = await client.accountInfo(user.hederaAccountId);
    const result = getTokenInfo(info, { tokenId });
    notifier.completed();
    return result;
}

/**
 * Connect to the message broker methods of working with tokens.
 *
 * @param channel - channel
 * @param tokenRepository - table with tokens
 */
export async function tokenAPI(
    channel: MessageBrokerChannel,
    apiGatewayChannel: MessageBrokerChannel,
    tokenRepository: DataBaseHelper<Token>
): Promise<void> {
    /**
     * Create new token
     *
     * @param {IToken} payload - token
     *
     * @returns {IToken[]} - all tokens
     */
    ApiResponse(channel, MessageAPI.SET_TOKEN, async (msg) => {
        try {
            if (!msg) {
                throw new Error('Invalid Params');
            }

            const { token, owner } = msg;

            await createToken(token, owner, tokenRepository, emptyNotifier());

            const tokens = await tokenRepository.findAll();
            return new MessageResponse(tokens);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message);
        }
    });

    ApiResponse(channel, MessageAPI.SET_TOKEN_ASYNC, async (msg) => {
        const { token, owner, taskId } = msg;
        const notifier = initNotifier(apiGatewayChannel, taskId);

        setImmediate(async () => {
            try {
                if (!msg) {
                    throw new Error('Invalid Params');
                }

                const result = await createToken(token, owner, tokenRepository, notifier);
                notifier.result(result);
            } catch (error) {
                new Logger().error(error, ['GUARDIAN_SERVICE']);
                notifier.error(error);
            }
        });

        return new MessageResponse({ taskId });
    });

    ApiResponse(channel, MessageAPI.FREEZE_TOKEN, async (msg) => {
        try {
            const { tokenId, username, owner, freeze } = msg;

            const token = await tokenRepository.findOne({ where: { tokenId: { $eq: tokenId } } });
            if (!token) {
                throw new Error('Token not found');
            }

            const users = new Users();
            const user = await users.getUser(username);
            if (!user) {
                throw new Error('User not found');
            }
            if (!user.hederaAccountId) {
                throw new Error('User is not linked to an Hedera Account');
            }

            const root = await users.getHederaAccount(owner);
            const client = new HederaSDKHelper(root.hederaAccountId, root.hederaAccountKey);
            const freezeKey = token.freezeKey;
            if (freeze) {
                await client.freeze(tokenId, user.hederaAccountId, freezeKey);
            } else {
                await client.unfreeze(tokenId, user.hederaAccountId, freezeKey);
            }

            const info = await client.accountInfo(user.hederaAccountId);
            const result = getTokenInfo(info, { tokenId });
            return new MessageResponse(result);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message, 400);
        }
    });

    ApiResponse(channel, MessageAPI.KYC_TOKEN, async (msg) => {
        try {
            const { tokenId, username, owner, grant } = msg;
            const result = await grantKycToken(tokenId, username, owner, grant, tokenRepository, emptyNotifier());
            return new MessageResponse(result);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message, 400);
        }
    });

    ApiResponse(channel, MessageAPI.KYC_TOKEN_ASYNC, async (msg) => {
        const { tokenId, username, owner, grant, taskId } = msg;
        const notifier = initNotifier(apiGatewayChannel, taskId);

        setImmediate(async () => {
            try {
                const result = await grantKycToken(tokenId, username, owner, grant, tokenRepository, notifier);
                notifier.result(result);
            } catch (error) {
                new Logger().error(error, ['GUARDIAN_SERVICE']);
                notifier.error(error);
            }
        });

        return new MessageResponse({ taskId });
    });

    ApiResponse(channel, MessageAPI.ASSOCIATE_TOKEN, async (msg) => {
        try {
            const { tokenId, did, associate } = msg;
            const status = await associateToken(tokenId, did, associate, tokenRepository, emptyNotifier());
            return new MessageResponse(status);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message, 400);
        }
    })

    ApiResponse(channel, MessageAPI.ASSOCIATE_TOKEN_ASYNC, async (msg) => {
        const { tokenId, did, associate, taskId } = msg;
        const notifier = initNotifier(apiGatewayChannel, taskId);

        setImmediate(async () => {
            try {
                const status = await associateToken(tokenId, did, associate, tokenRepository, notifier);
                notifier.result(status);
            } catch (error) {
                new Logger().error(error, ['GUARDIAN_SERVICE']);
                notifier.error(error);
            }
        });

        return new MessageResponse({ taskId });
    })

    ApiResponse(channel, MessageAPI.GET_INFO_TOKEN, async (msg) => {
        try {
            const { tokenId, username, owner } = msg;

            const users = new Users();
            const user = await users.getUser(username);
            if (!user) {
                throw new Error('User not found');
            }

            const token = await tokenRepository.findOne({ where: { tokenId: { $eq: tokenId } } });
            if (!token) {
                throw new Error('Token not found');
            }

            if (!user.hederaAccountId) {
                return new MessageResponse(getTokenInfo(null, token));
            }

            const root = await users.getHederaAccount(owner);
            const client = new HederaSDKHelper(root.hederaAccountId, root.hederaAccountKey);
            const info = await client.accountInfo(user.hederaAccountId);
            const result = getTokenInfo(info, token);

            return new MessageResponse(result);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message, 400);
        }
    })

    ApiResponse(channel, MessageAPI.GET_ASSOCIATED_TOKENS, async (msg) => {
        try {
            const wallet = new Wallet();
            const users = new Users();
            const { did } = msg;
            const user = await users.getUserById(did);
            const userID = user.hederaAccountId;
            const userDID = user.did;
            const userKey = await wallet.getKey(user.walletToken, KeyType.KEY, userDID);

            if (!user) {
                throw new Error('User not found');
            }

            if (!user.hederaAccountId) {
                return new MessageResponse([]);

            }

            const client = new HederaSDKHelper(userID, userKey);
            const info = await client.accountInfo(user.hederaAccountId);
            const tokens: any = await tokenRepository.find(user.parent
                ? {
                    where: {
                        $or: [
                            { owner: { $eq: user.parent } },
                            { owner: { $exists: false } }
                        ]
                    }
                }
                : {}
            );

            const result: any[] = [];
            for (const token of tokens) {
                result.push(getTokenInfo(info, token));
            }
            return new MessageResponse(result);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message, 400);
        }
    })

    /**
     * Return tokens
     *
     * @param {Object} [payload] - filters
     * @param {string} [payload.tokenId] - token id
     * @param {string} [payload.did] - user did
     *
     * @returns {IToken[]} - tokens
     */
    ApiResponse(channel, MessageAPI.GET_TOKENS, async (msg) => {
        if (msg) {
            if (msg.tokenId) {
                const reqObj: any = { where: {} as unknown };
                reqObj.where.tokenId = { $eq: msg.tokenId }
                const tokens: IToken[] = await tokenRepository.find(reqObj);
                return new MessageResponse(tokens);

            }
            if (msg.ids) {
                const reqObj: any = { where: {} as unknown };
                reqObj.where.tokenId = { $in: msg.ids }
                const tokens: IToken[] = await tokenRepository.find(reqObj);
                return new MessageResponse(tokens);

            }
        }
        return new MessageResponse(await tokenRepository.find({
            where: {
                $or: [
                    { owner: { $eq: msg.did } },
                    { owner: { $exists: false } }
                ]
            }
        }));
    })

    /**
     * Import tokens
     *
     * @param {IToken[]} payload - tokens
     *
     * @returns {IToken[]} - all tokens
     */
    ApiResponse(channel, MessageAPI.IMPORT_TOKENS, async (msg) => {
        try {
            let items: IToken[] = msg;
            if (!Array.isArray(items)) {
                items = [items];
            }
            const existingTokens = await tokenRepository.findAll();
            const existingTokensMap = {};
            for (const existingToken of existingTokens) {
                existingTokensMap[existingToken.tokenId] = true;
            }
            items = items.filter((token: any) => !existingTokensMap[token.tokenId]);
            const tokenObject = tokenRepository.create(items);
            await tokenRepository.save(tokenObject);
            const tokens = await tokenRepository.findAll();
            return new MessageResponse(tokens);
        } catch (error) {
            new Logger().error(error.message, ['GUARDIAN_SERVICE']);
            return new MessageError(error.message);
        }
    })
}
