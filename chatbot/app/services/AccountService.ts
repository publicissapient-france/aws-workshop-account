import AWS from '../utils/awssdk.utils';
import logger from '../utils/logger.utils';
import * as generator from 'generate-password';
import { UsersCreateRequest, UsersDeleteRequest } from '../../typings/WorkShop';

const cloudwatchevents = new AWS.CloudWatchEvents();
const ses = new AWS.SES();

const ROLE_TO_ASSUME = process.env.ROLE_TO_ASSUME;
const SES_CREATE_TEMPLATE = process.env.SES_CREATE_TEMPLATE || '';
const LOGIN_URL = process.env.LOGIN_URL;
const LAMBDA_ARN_TO_DELETE = process.env.LAMBDA_ARN_TO_DELETE || 'arn:aws:lambda:eu-west-1:010154155802:function:workshop-user-delete';


/**
 * workshop-name
 * responsable-email: email of the event manager which will receive user/password
 * users-to-create: ["username1", "username2"]
 * group: "groupname in which add the user"
 * date-to-delete: ISO 8601 date
 * @param params
 * @returns {Promise<number>}
 */
export async function createAccounts(params: UsersCreateRequest) {
  logger.info('AccountService.createAccounts with parameters', params);

  // Check parameters
  if (!params.workshopName || !params.dateToDelete) {
    logger.error('Missing parameters. Mandatory: workshop-name, users-to-create, date-to-delete');
    throw new Error('Missing parameters');
  }

  assumeRoleInWorkshopAccount();

  // Create users
  const usersToCreate = generateUsersName(params.workshopName, params.nbUsersToCreate);
  const userCreatedPromise = usersToCreate
    .map(username => createUser(username, params.groupName));

  const usersCreated = await Promise.all(userCreatedPromise);
  logger.info('Created users', JSON.stringify(usersCreated));

  // Create schedule rule to delete users
  await createScheduleRuleToDeleteUsers(params.workshopName,
    usersToCreate,
    new Date(params.dateToDelete),
    LAMBDA_ARN_TO_DELETE);

  logger.info('Send email to', params.responsableEmail);
  await sendCreateEmail(params.workshopName, usersCreated, params.responsableEmail);

  return usersCreated;
};

function generateUsersName(workshopName: string, nbUserToGenerate: number): string[] {
  return Array.from({ length: nbUserToGenerate }, (v, k) => k + 1)
    .map(nb => `${workshopName}-${nb}`);
}

export async function deleteAccounts(params: UsersDeleteRequest) {
  logger.info('AccountService.deleteAccounts with parameters', params);

  const usersToDelete = params.usersToDelete || [];
  const workshopName = params.workshopName;

  // Check parameters
  if (!usersToDelete || !workshopName) {
    logger.error('Missing parameters. Mandatory: workshop-name, users-to-create, date-to-delete');
    throw new Error('Missing parameters');
  }

  assumeRoleInWorkshopAccount();
  const userDeletedPromise = usersToDelete.map(deleteUsers);

  const userDeleted = await Promise.all(userDeletedPromise);
  logger.info('Deleted users', JSON.stringify(userDeleted));

  // Delete the schedule rule
  await deleteScheduleRule(workshopName)
  return userDeleted;
};

async function deleteScheduleRule(workshopName: string) {
  const ruleName = getScheduleRuleName(workshopName);
  const ruleExist = await cloudwatchevents.describeRule({ Name: ruleName }).promise()
    .then(result => true)
    .catch(error => {
      if(error.code === "ResourceNotFoundException") {
        return true;
      }
      logger.error(`Error reading schedule rule ${ruleName}`, error);
      return false;
    });

  if (ruleExist) {
    logger.info('Delete schedule rule', ruleName);
    await cloudwatchevents.removeTargets({ Ids: ['1'], Rule: ruleName }).promise();
    await cloudwatchevents.deleteRule({ Name: ruleName }).promise();
  }
}

function assumeRoleInWorkshopAccount() {
  AWS.config.credentials = new AWS.TemporaryCredentials({
    RoleArn: ROLE_TO_ASSUME,
    RoleSessionName: 'create-user',
    DurationSeconds: 900
  });
}

async function deleteUsers(username) {
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
    await Promise.all(accesskeys.map((k: string) => iam.deleteAccessKey({ AccessKeyId: k, UserName: username }).promise()));

    // Delete access keys
    const sshkeys = await getSSHKeys(username);
    await Promise.all(sshkeys.map(k => iam.deleteSSHPublicKey({ SSHPublicKeyId: k, UserName: username }).promise()));

    // Delete specific service credentials
    const creds = await getSpecificCredentials(username);
    await Promise.all(creds.map(k => iam.deleteServiceSpecificCredential({
      ServiceSpecificCredentialId: k,
      UserName: username,
    }).promise()));

    // Finally delete the user
    await iam.deleteUser({ UserName: username }).promise();
  }

  return username;
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
    .then((result: any) => result.SSHPublicKeys.map(g => g.SSHPublicKeyId));
}

async function getSpecificCredentials(username) {
  const iam = new AWS.IAM();
  return iam.listServiceSpecificCredentials({ UserName: username }).promise()
    .then((result: any) => result.ServiceSpecificCredentials.map(g => g.ServiceSpecificCredentialId));
}

async function createUser(username, group) {
  const iam = new AWS.IAM();

  try {
    // Create the user
    logger.debug('Create user', username);
    await iam.createUser({ UserName: username }).promise();

    // Set password to the account
    const password = generator.generate({
      strict: true,
      length: 10,
      symbols: true,
      uppercase: true,
      numbers: true,
      excludeSimilarCharacters: true,
    });
    logger.debug(`Create login profile for ${username} with password ${password}`);
    await iam.createLoginProfile({ Password: password, UserName: username }).promise();

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

async function createScheduleRuleToDeleteUsers(workshopName, users, deleteDate, lambdaArn) {
  if (lambdaArn === "[object Object]") {
    return;
  }

  const ruleParams = {
    Name: getScheduleRuleName(workshopName),
    ScheduleExpression: `cron(${deleteDate.getUTCMinutes()} ${deleteDate.getUTCHours()} ${deleteDate.getUTCDate()} ${deleteDate.getUTCMonth() + 1} ? ${deleteDate.getFullYear()})`,
    State: 'ENABLED',
  };

  await cloudwatchevents.putRule(ruleParams).promise()
    .then(result => logger.info(`Schedule rule ${ruleParams.Name} is created`, ruleParams))
    .catch(error => {
      logger.error(`Error creating schedule rule ${ruleParams.Name}`, error);
      throw error;
    });

  const deleteParams: UsersDeleteRequest = {
    workshopName: workshopName,
    usersToDelete: users
  };
  const targetParams = {
    Rule: ruleParams.Name,
    Targets: [{
      Arn: lambdaArn,
      Id: '1',
      Input: JSON.stringify(deleteParams)
    }]
  };
  await cloudwatchevents.putTargets(targetParams).promise()
    .then(result => logger.info(`Target is set on schedule rule ${ruleParams.Name}`, targetParams))
    .catch(error => {
      logger.error(`Error setting target on schedule rule ${ruleParams.Name}`, error);
      throw error;
    });
}

function getScheduleRuleName(workshopName) {
  return `workshop-${workshopName}-user-delete`;
}

async function sendCreateEmail(workshopName: string, usersCreated, address: string) {
  const params = {
    Destination: {
      ToAddresses: [address]
    },
    Source: "admin@xebia.fr",
    Template: SES_CREATE_TEMPLATE,
    TemplateData: JSON.stringify({
      workshopName: workshopName,
      loginUrl: LOGIN_URL,
      accounts: usersCreated
    })
  };

  await ses.sendTemplatedEmail(params).promise()
    .then(result => logger.debug(`Send email success with params`, params))
    .catch(error => logger.error(`Error when sending email with params ${JSON.stringify(params)}`, error));
}