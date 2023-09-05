// ref: https://github.com/bnb-chain/greenfield-js-sdk/blob/alpha/examples/nextjs/README.md
import { Client } from '@bnb-chain/greenfield-js-sdk';
// import { useAccount, useNetwork } from 'wagmi';
// const { address } = useAccount();
// const { chain } = useNetwork();

/* Greenfield testnet config */
export const GRPC_URL = "https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org";
export const GREENFIELD_RPC_URL = "https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org";
export const GREEN_CHAIN_ID = 5600;
export const BSC_RPC_URL = "https://gnfd-bsc-testnet-dataseed1.bnbchain.org";
export const BSC_CHAIN_ID = 97;
// The contract address may be outdated due to Greenfield reset,
// refer to https://docs.bnbchain.org/greenfield-docs/docs/guide/dapp/contract-list get the latest contract address.
export const TOKEN_HUB_CONTRACT_ADDRESS = "";
export const CROSS_CHAIN_CONTRACT_ADDRESS = "";
export const ACCOUNT_PRIVATEKEY = ""; // private key of the account

/* Greenfield client config */
export const client = Client.create(GRPC_URL, String(GREEN_CHAIN_ID));

export const getSps = async () => {
    const sps = await client.sp.getStorageProviders();
    const finalSps = (sps ?? []).filter(v => v?.description?.moniker !== 'QATest');

    return finalSps;
};

export const selectSp = async () => {
    const finalSps = await getSps();

    const selectIndex = Math.floor(Math.random() * finalSps.length);

    const secondarySpAddresses = [
        ...finalSps.slice(0, selectIndex),
        ...finalSps.slice(selectIndex + 1),
    ].map((item) => item.operatorAddress);
    const selectSpInfo = {
        id: finalSps[selectIndex].id,
        endpoint: finalSps[selectIndex].endpoint,
        primarySpAddress: finalSps[selectIndex]?.operatorAddress,
        sealAddress: finalSps[selectIndex].sealAddress,
        secondarySpAddresses,
    };

    return selectSpInfo;
};

/* Greenfield bucket management */

export const createBucket = async (bucketName, address) => {
    const spInfo = await selectSp();
    console.log('spInfo', spInfo);

    const createBucketTx = await client.bucket.createBucket({
        bucketName: bucketName,
        creator: address,
        visibility: 'VISIBILITY_TYPE_PUBLIC_READ',
        chargedReadQuota: '0',
        spInfo: {
            primarySpAddress: spInfo.primarySpAddress,
        },
        signType: 'authTypeV1',
        privateKey: ACCOUNT_PRIVATEKEY,
    });

    const simulateInfo = await createBucketTx.simulate({
        denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await createBucketTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: address,
        granter: '',
    });

    if (res.code === 0) {
        alert('success');
    }
};

export const createBucketOffChainAuth = async (bucketName, address, chain) => {
    const domain = window.location.origin;
    const key = `${address}-${chain?.id}`;

    const spInfo = await selectSp();
    const { seedString } = JSON.parse(localStorage.getItem(key) || '{}');
    const createBucketTx = await client.bucket.createBucket({
        bucketName: bucketName,
        creator: address,
        visibility: 'VISIBILITY_TYPE_PUBLIC_READ',
        chargedReadQuota: '0',
        spInfo,
        signType: 'offChainAuth',
        domain,
        seedString,
    });

    const simulateInfo = await createBucketTx.simulate({
        denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await createBucketTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: address,
        granter: '',
    });

    if (res.code === 0) {
        alert('success');
    }
};

export const deleteBucket = async (bucketName, address) => {
    const deleteBucketTx = await client.bucket.deleteBucket({
        bucketName: bucketName,
        operator: address,
    });

    const simulateInfo = await deleteBucketTx.simulate({
        denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await deleteBucketTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: address,
        granter: '',
    });

    console.log('res', res);
    if (res.code === 0) {
        alert('success');
    }
};

export const getUserBuckets = async (address) => {
    // const bucketInfo = await client.bucket.headBucket(bucketName);
    // const bucketInfo = await client.bucket.headBucketById(bucketId);
    const spInfo = await selectSp();
    const res = await client.bucket.getUserBuckets({
        address,
        endpoint: spInfo.endpoint,
    });
    console.log(res);
};

/* Greenfield object management */

export const getObjectInfo = async (bucketName, objectName) => {
    const objInfo = await client.object.headObject(
        bucketName,
        objectName
    );
    console.log(objInfo);
};

export const listObjects = async (bucketName) => {
    const spInfo = await selectSp();

    const res = await client.object.listObjects({
        bucketName,
        endpoint: spInfo.endpoint,
    });
    console.log('res', res);
};


export const uploadObject = async (bucketName, objectName, file, address) => {
    const fileBytes = await file.arrayBuffer();
    const hashResult = await FileHandler.getPieceHashRoots(
        new Uint8Array(fileBytes)
    );
    const { contentLength, expectCheckSums } = hashResult;

    const createObjectTx = await client.object.createObject({
        bucketName: bucketName,
        objectName: objectName,
        creator: address,
        visibility: 'VISIBILITY_TYPE_PUBLIC_READ',
        fileType: file.type,
        redundancyType: 'REDUNDANCY_EC_TYPE',
        contentLength,
        expectCheckSums,
        signType: 'authTypeV1',
        privateKey: ACCOUNT_PRIVATEKEY,
    });

    const simulateInfo = await createObjectTx.simulate({
        denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await createObjectTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: address,
        granter: '',
    });

    console.log('res', res);

    if (res.code === 0) {
        alert('create object tx success');
        const txHash = res.transactionHash;
        const uploadRes = await client.object.uploadObject({
            bucketName: bucketName,
            objectName: objectName,
            body: file,
            txnHash: txHash,
            signType: 'authTypeV1',
            privateKey: ACCOUNT_PRIVATEKEY,
        });
        console.log('uploadRes', uploadRes);

        if (uploadRes.code === 0) {
            alert('success');
        }
    }
};


export const createFolder = async (bucketName, folderName, address) => {
    const createFolderTx = await client.object.createFolder(
        {
            bucketName: bucketName,
            objectName: folderName + '/',
            creator: address,
        },
        {
            signType: 'authTypeV1',
            privateKey: ACCOUNT_PRIVATEKEY,
        }
    );

    const simulateInfo = await createFolderTx.simulate({
        denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await createFolderTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: address,
        granter: '',
    });

    console.log('res', res);

    if (res.code === 0) {
        alert('success');
    }
};

export const deleteObject = async (bucketName, objectName, address) => {
    const deleteObjectTx = await client.object.deleteObject({
        bucketName,
        objectName,
        operator: address,
    });

    const simulateInfo = await deleteObjectTx.simulate({
        denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await deleteObjectTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: address,
        granter: '',
    });

    console.log('res', res);
    if (res.code === 0) {
        alert('success');
    }
};

export const getObject = async (bucketName, objectName) => {
    const res = await client.object.getObject(
        {
            bucketName: bucketName,
            objectName: objectName,
        },
        {
            signType: 'authTypeV1',
            privateKey: ACCOUNT_PRIVATEKEY,
        }
    );

    console.log('res', res);
    if (res.code === 0) {
        alert('success');
    }
    return {data: res.body};  // fileBlob
};
