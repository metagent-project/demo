import { createBucket, uploadObject, getObject, createFolder } from './greenfield_api.js';

const AGENT_STATE = 'agent_state';
const AGENT_PROFILE = 'agent_profile';
const AGENT_CONVERSATION = 'agent_conversation';
const GROUP_INTERACTION = 'group_interaction';

export const initMetagentUserStorage = async (userID, address) => {
    const bucketName = `metagent-user-${userID}`;
    const res = await createBucket(bucketName, address);
    if (res.code !== 0) {
        console.log('createBucket failed');
    }
    const res2 = await createFolder(bucketName, AGENT_CONVERSATION, address);
    if (res2.code !== 0) {
        console.log(`createFolder failed: ${AGENT_CONVERSATION}`);
    }
    const res3 = await createFolder(bucketName, AGENT_STATE, address);
    if (res3.code !== 0) {
        console.log(`createFolder failed: ${AGENT_STATE}`);
    }
    const res4 = await createFolder(bucketName, GROUP_INTERACTION, address);
    if (res4.code !== 0) {
        console.log(`createFolder failed: ${GROUP_INTERACTION}`);
    }
}

const jsonToBlob = (json) => {
    // JSON to blob file
    return new Blob([JSON.stringify(json)], { type: 'application/json' });
}

export const putMetagentAgentState = async (userID, agentID, agentState, address) => {
    const bucketName = `metagent-user-${userID}`;
    const objectName = `${AGENT_STATE}/${agentID}.json`;
    const res = await uploadObject(bucketName, objectName, jsonToBlob(agentState), address);
    if (res.code === 0) {
        return true;
    }
    return false;
}

export const getMetagentAgentState = async (userID, agentID) => {
    const bucketName = `metagent-user-${userID}`;
    const objectName = `${AGENT_STATE}/${agentID}.json`;
    const res = await getObject(bucketName, objectName);
    if (res.code === 0) {
        return JSON.parse(res.data);
    }
    return null;
}

export const getMetagentAgentProfile = async (agentID) => {
    const bucketName = `metagent-${AGENT_PROFILE}`;
    const objectName = `${agentID}.json`;
    const res = await getObject(bucketName, objectName);
    if (res.code === 0) {
        return JSON.parse(res.data);
    }
    return null;
}

export const putMetagentAgentConversation = async (userID, agentID, conversationID, conversation, address) => {
    // TODO: create a folder for each agent?
    const bucketName = `metagent-user-${userID}`;
    const objectName = `${AGENT_CONVERSATION}/${agentID}/${conversationID}.json`;
    const res = await uploadObject(bucketName, objectName, jsonToBlob(conversation), address);
    if (res.code === 0) {
        return true;
    }
    return false;
}

export const getMetagentAgentConversation = async (userID, agentID, conversationID) => {
    const bucketName = `metagent-user-${userID}`;
    const objectName = `${AGENT_CONVERSATION}/${agentID}/${conversationID}.json`;
    const res = await getObject(bucketName, objectName);
    if (res.code === 0) {
        return JSON.parse(res.data);
    }
    return null;
}

export const putMetagentGroupInteractions = async (userID, groupInteractionID, groupInteractions, address) => {
    // JSON to blob file
    const bucketName = `metagent-user-${userID}`;
    const objectName = `${AGENT_CONVERSATION}/${groupInteractionID}.json`;
    const res = await uploadObject(bucketName, objectName, jsonToBlob(groupInteractions), address);
    if (res.code === 0) {
        return true;
    }
    return false;
}


export const getMetagentVirtualTownConfig = async (virtualTownID) => {
    const bucketName = `metagent-town`;
    const objectName = `${virtualTownID}.json`;
    const res = await getObject(bucketName, objectName);
    if (res.code === 0) {
        return JSON.parse(res.data);
    }
    return null;
}
