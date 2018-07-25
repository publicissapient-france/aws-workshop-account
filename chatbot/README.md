
The lambda

````bash
npm install

# Run in local
AWS_PROFILE=<aws-profile> npm start


# Run tests
# No automatic tests but a payload for create and delete users are present in the tests directory

curl -XPOST http://localhost:3000 -H "Content-Type: application/json" -d @app/tests/create.payload.json

AWS_PROFILE=<aws-profile> serverless invoke local --f WorkshopUsersDelete -p app/tests/delete.payload.json
````