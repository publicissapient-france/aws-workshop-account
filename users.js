'use strict';
const AWS = require('aws-sdk');
const cloudwatchevents = new AWS.CloudWatchEvents();
const logger = require('./logger.utils');

const ROLE_TO_ASSUME = process.env.ROLE_TO_ASSUME;

/**
 * workshop-name
 * user-to-create: ["username1", "username2"]
 * group: "groupname in which add the user"
 * date-to-delete: ISO 8601 date
 * @param event
 * @returns {Promise<number>}
 */
module.exports.create = async function (event, context) {
  logger.info('Run lambda users-create with parameters', JSON.stringify(event));

  // Check parameters
  if(!event['workshop-name'] || !event['user-to-create'] || !event['date-to-delete']) {
    logger.error('Missing parameters. Mandatory: workshop-name, user-to-create, date-to-delete');
    return;
  }
  assumeRole();

  // Create users
  const userCreatedPromise = (event['user-to-create'] || [])
    .map(username => createUser(username, event['groupname']));

  const userCreated = await Promise.all(userCreatedPromise);
  logger.info('Created users', JSON.stringify(userCreated));

  // Create schedule rule to delete users
  await createRuleToDeleteUsers(event['workshop-name'], event['user-to-create'], new Date(event['date-to-delete']), context.invokedFunctionArn);
};

module.exports.delete = async function (event) {
  logger.info('Run lambda users-delete with parameters', JSON.stringify(event));

  const dateToDelete = event['date-to-delete'];
  const usersToDelete = event['users-to-delete'];

  // Delete date is not reached: nothing to do
  if(new Date() <= dateToDelete)
    return;

  logger.info(`Date to delete users ${usersToDelete} is reached`);
  assumeRole();
  const userCreatedPromise = (usersToDelete || []).map(deleteUser);

  const userCreated = await Promise.all(userCreatedPromise);
  logger.info('Deleted users', JSON.stringify(userCreated));

  return 42;
};

function assumeRole() {
  AWS.config.credentials = new AWS.TemporaryCredentials({
    RoleArn: ROLE_TO_ASSUME,
  });
}

async function deleteUser(username) {
  const iam = new AWS.IAM();

  if (await isUserExists(username)) {
    logger.debug('Delete user', username);

    // Delete login profile
    await deleteLoginProfile(username);

    // Remove user from group
    const groups = await getGroupForUser(username);
    await Promise.all(groups.map(g => iam.removeUserFromGroup({ GroupName: g, UserName: username }).promise()));

    // Delete access keys
    const accesskeys = await getAccessKeys(username);
    await Promise.all(accesskeys.map(k => iam.deleteAccessKey({ AccessKeyId: k, UserName: username }).promise()));

    // Delete access keys
    const sshkeys = await getSSHKeys(username);
    await Promise.all(sshkeys.map(k => iam.deleteSSHPublicKey({ SSHPublicKeyId: k, UserName: username }).promise()));

    // Delete specific service credentials
    const creds = await getSpecificCredentials(username);
    await Promise.all(creds.map(k => iam.deleteServiceSpecificCredential({ ServiceSpecificCredentialId: k, UserName: username }).promise()));

    // Finally delete the user
    await iam.deleteUser({ UserName: username }).promise();
  }
}

async function deleteLoginProfile(username) {
  const iam = new AWS.IAM();
  return iam.deleteLoginProfile({ UserName: username }).promise()
    .then(result => logger.debug(`Login profile for ${username} is deleted with success`))
    .catch(error => {
      if (error.code === 'NoSuchEntity') {
        logger.info(`Login profile for ${username} doesn't exist`);
        return;
      }

      logger.error(`Login profile for ${username} cannot be delete`, error);
      throw error;
    });
}

async function isUserExists(username) {
  const iam = new AWS.IAM();
  try {
    const user = await iam.getUser({ UserName: username }).promise();
    return !!user.User;
  }
  catch (e) {
    if (e.code === 'NoSuchEntity')
      return false;
    throw e;
  }
}

async function getGroupForUser(username) {
  const iam = new AWS.IAM();
  return iam.listGroupsForUser({ UserName: username }).promise()
    .then(result => result.Groups.map(g => g.GroupName));
}

async function getAccessKeys(username) {
  const iam = new AWS.IAM();
  return iam.listAccessKeys({ UserName: username }).promise()
    .then(result => result.AccessKeyMetadata.map(g => g.AccessKeyId));
}

async function getSSHKeys(username) {
  const iam = new AWS.IAM();
  return iam.listSSHPublicKeys({ UserName: username }).promise()
    .then(result => result.SSHPublicKeys.map(g => g.SSHPublicKeyId));
}

async function getSpecificCredentials(username) {
  const iam = new AWS.IAM();
  return iam.listServiceSpecificCredentials({ UserName: username }).promise()
    .then(result => result.ServiceSpecificCredentials.map(g => g.ServiceSpecificCredentialId));
}

async function createUser(username, group) {
  const iam = new AWS.IAM();

  try {
    // Create the user
    logger.debug('Create user', username);
    await iam.createUser({ UserName: username }).promise();

    // Set password to the account
    logger.debug('Create login profile for', username);
    const password = `Xebia!${randomString()}`;
    const paramsPassword = {
      Password: password,
      UserName: username,
    };
    await iam.createLoginProfile(paramsPassword).promise()

    // Add the user to the specified group
    logger.debug(`Add user ${username} to the group `, group);
    await iam.addUserToGroup({ UserName: username, GroupName: group }).promise();

    return { username, password, error: undefined };
  }
  catch (e) {
    logger.error(`Error creating user ${username}`, e);
    return { username, error: e };
  }
}

function randomString(size = 5) {
  return Math.random().toString(36).substring(2, 2 + size)
}


async function createRuleToDeleteUsers(workshopName, users, deleteDate, lambdaArn = 'arn:aws:lambda:eu-west-1:010154155802:function:workshop-user-delete') {
  const ruleParams = {
    Name: `workshop-${workshopName}-user-delete`,
    ScheduleExpression: 'rate(1 hour)',
    State: 'ENABLED'
  };

  await cloudwatchevents.putRule(ruleParams).promise();

  const targetParams = {
    Rule: ruleParams.Name,
    Targets: [{
      Arn: lambdaArn,
      Id: '1',
      Input: JSON.stringify({"date-to-delete": deleteDate.toISOString(), "users-to-delete": users })
    }]
  };
  await cloudwatchevents.putTargets(targetParams).promise();
}