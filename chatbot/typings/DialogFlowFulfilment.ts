
// ####### Container for response #######

export type DialogFlowResponse = {
  httpStatus: number,
  content?: FulfilmentResponse
}

// ####### DialogFlow request for fulfilment #######
export type FulfilmentRequest = {
  responseId: string,
  session: string,
  queryResult: FulfilmentQuery,
  originalDetectIntentRequest: any
};

export type FulfilmentQuery = {
  queryText: string,
  parameters: any,
  allRequiredParamsPresent: boolean,
  fulfillmentText: string,
  fulfillmentMessages: any,
  outputContexts: any,
  intent: any,
  intentDetectionConfidence: number,
  diagnosticInfo: any,
  languageCode: string
}

// ####### DialogFlow response for fulfilment #######
export type FulfilmentResponse = {
  fulfillmentText?: string,
  fulfillmentMessages?: any[],
  source?: string,
  payload?: any,
  outputContexts?: OutputContext[],
  followupEventInput?: FollowUpEvent
}

export type OutputContext = {
  name: string,
  lifespanCount: number,
  parameters: StringMap
}
export type FollowUpEvent = {
  name: string,
  languageCode: string
}

interface StringMap { [s: string]: string; }