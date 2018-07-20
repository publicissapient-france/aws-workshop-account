import * as AccountService from '../services/AccountService'
import { Context as LambdaContext, ProxyCallback } from 'aws-lambda';

export function deleteUsers(event: any, context: LambdaContext) {
  return AccountService.deleteAccounts(event);
}