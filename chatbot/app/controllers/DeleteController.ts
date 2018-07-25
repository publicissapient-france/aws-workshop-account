import * as AccountService from '../services/AccountService'
import { Context as LambdaContext, ProxyCallback } from 'aws-lambda';
import { UsersDeleteRequest } from '../../typings/WorkShop';

export function deleteUsers(event: UsersDeleteRequest, context: LambdaContext) {
  return AccountService.deleteAccounts(event);
}