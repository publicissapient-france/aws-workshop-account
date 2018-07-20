import AWS from '../utils/awssdk.utils';

import logger, { errorToString } from '../utils/logger.utils';

const organizations = new AWS.Organizations();

export {
  createAccounts
}


async function createAccounts(params) {

  for (let i = 0; i < params.count; i++) {
    const orgaParams = {
      AccountName: `${params.prefix}-${i+1}`,
      Email: "jpinsolle+workshoptest@xebia.fr"
    };

    try {
      // const result = await organizations.createAccount(orgaParams).promise();
      const result = {};

      logger.info('Create AWS account in the organisation with params', {
        params: JSON.stringify(params),
        status: "ok",
        result: JSON.stringify(result)
      });

    }
    catch (error) {
      logger.info('Error create AWS account in the organisation with params', {
        params: JSON.stringify(params),
        status: "ko",
        error: errorToString(error)
      });
      throw error;
    }
  }


}