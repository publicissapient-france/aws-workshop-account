import { Context } from 'koa';
import * as Router from 'koa-router';
import logger, { errorToString } from '../utils/logger.utils';
import { WebhookClient } from 'dialogflow-fulfillment';
import { IntentDecider } from './IntentDecider';
import { DialogFlowResponse, FulfilmentRequest } from '../../typings/DialogFlowFulfilment';
import * as AccountService from '../services/AccountService';
import * as _ from 'lodash';
import * as moment from 'moment';
import { UsersCreateRequest } from '../../typings/WorkShop';

const projectId = 'aws-workshop-114ca';
const sessionId = 'quickstart-session-id';
const languageCode = 'fr-FR';

// Dialogflow Integrations
// Email address dialogflow-edfcqk@aws-workshop-114ca.iam.gserviceaccount.com
// Key IDs 34b5d59545293af02e137307117770171e96076d


export function routes(): Router {
  const router = new Router();
  router
    .post('/', fulfilment);

  return router;
}

const decider = new IntentDecider()
  .addIntent("Fulfil event name", intentComputeEventName)
  .addIntent("Fulfil end date", intentEndDate)
  .addIntent("Order accounts creation - yes", createAccount)
  .defaultIntent(notFound);


function getEndDate(params) {
  let endDateString = params['end-date'];
  if (!params['end-date']) {
    logger.info('End date parameter not found in the payload. Set end date to today', { params: JSON.stringify(params) });
    endDateString = undefined;
  }

  const endDate = moment(endDateString);

  // If no end time in the request craft a default end time (midnight)
  const endTime = params['end-time'] ? moment(params['end-time']) : moment().hours(23).minutes(59).seconds(0);

  // Compute final end date
  const finalEndDate = endDate
    .hours(endTime.hours())
    .minutes(endTime.minutes())
    .seconds(endTime.seconds());

  return finalEndDate;
}

async function intentEndDate(request: FulfilmentRequest): Promise<DialogFlowResponse> {
  const endDate = getEndDate(request.queryResult.parameters);
  logger.info(`The event end at ${endDate}`, { params: JSON.stringify(request.queryResult.parameters)});

  return {
    "httpStatus": 200,
    "content": {
      "outputContexts": [
        {
          "name": `${request.session}/contexts/accounts-info`,
          "lifespanCount": 5,
          "parameters": {
            "end-date-computed": endDate.toISOString()
          }
        }
      ],
      // Go to the intent that sum up all the parameters
      "followupEventInput": {
        "name": "event_order_account_creation",
        "languageCode": "fr"
      }
    }
  };
}

async function intentComputeEventName(request: FulfilmentRequest): Promise<DialogFlowResponse> {

  if (!request.queryResult.parameters['accounts-name']) {
    logger.error("Not found accounts-name in the fulfilment request");
    return { "httpStatus": 400 };
  }


  const computedEventName = request.queryResult.parameters['accounts-name']
    .trim()
    .replace(/ /g, '-')
    .substring(0, 20);

  return {
    "httpStatus": 200,
    "content": {
      "outputContexts": [
        {
          "name": `${request.session}/contexts/accounts-info`,
          "lifespanCount": 5,
          "parameters": {
            "accounts-name-computed": computedEventName
          }
        }
      ]
    }
  };
}

async function createAccount(request: FulfilmentRequest): Promise<DialogFlowResponse> {
  const context = request.queryResult.outputContexts.find(e => e.name === `${request.session}/contexts/accounts-info`);
  const computedEventName = context.parameters['accounts-name-computed'];
  const numberOfAccounts = context.parameters['accounts-number'] || 1;
  const deleteDate = context.parameters['end-date-computed'];


  const createParams: UsersCreateRequest = {
    responsableEmail: 'jpinsolle@xebia.fr',
    nbUsersToCreate: numberOfAccounts,
    workshopName: computedEventName,
    dateToDelete: deleteDate,
    groupName: 'meetup'
  };
  await AccountService.createAccounts(createParams);

  return {
    httpStatus: 200
  };
}

async function notFound(request: FulfilmentRequest): Promise<DialogFlowResponse> {
  const intentName = _.get(request, 'queryResult.intent.displayName');
  logger.info(`Intent not found`, { intentName: intentName });
  return { httpStatus: 404 };
}

async function fulfilment(ctx: Context, next: Function) {
  const body: FulfilmentRequest = ctx.request.body;
  logger.debug('Request received for fulfilment', { body: JSON.stringify(body, null, 2) });

  if (!body) {
    ctx.throw(400, 'Body is mandatory')
  }

  const response: DialogFlowResponse = await decider.process(body);
  ctx.body = response.content;
  ctx.status = response.httpStatus;
}