import { DialogFlowResponse, FulfilmentRequest } from '../../typings/DialogFlowFulfilment';
import logger from '../utils/logger.utils';

export class IntentDecider {

  private mapping = {};
  private _defaultIntent: IntentCallback;


  public addIntent(intentName: string, resolve: IntentCallback) {
    this.mapping[intentName] = resolve;
    return this;
  }

  public async process(request: FulfilmentRequest): Promise<DialogFlowResponse> {
    const intentName = request.queryResult.intent.displayName;
    const functionToExecute: IntentCallback = this.mapping[intentName];

    if (!functionToExecute) {

      if (!this._defaultIntent) {
        return notFound(request)
      }
      else if (this._defaultIntent) {
        return this._defaultIntent(request);
      }
    }

    logger.debug(`Found function ${functionToExecute.name} for intent ${intentName}`)
    return functionToExecute(request);
  }

  public defaultIntent(fn: IntentCallback) {
    this._defaultIntent = fn;
    return this;
  }
}

async function notFound(request: FulfilmentRequest): Promise<DialogFlowResponse> {
  const intentName = request.queryResult.intent.displayName;
  logger.error(`Intent ${intentName} is not handle`);
  return { httpStatus: 404 };

}

export interface IntentCallback {
  (request: FulfilmentRequest): Promise<DialogFlowResponse>
}

export class IntentNotFound extends Error {
  private intentName;

  constructor(intentName: string) {
    super(`Intent ${intentName} not found`);
    this.intentName = intentName;
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
  }
}