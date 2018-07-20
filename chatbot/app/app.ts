import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import errorsMiddleware from './middlewares/ErrorsMiddleware';

import {routes as booksRoutes} from './controllers/ChatBotController'

const app = new Koa();
app.use(errorsMiddleware);
app.use(bodyParser());

const rootRouter = new Router({"prefix": '/:stage?'});
rootRouter.use('/', booksRoutes().routes());


app.use(rootRouter.routes());
app.use(rootRouter.allowedMethods());

export default app;

