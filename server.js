const cors = require('cors')
const http = require('http')
const express = require('express')
const app = express()

const server = http.createServer(app)

app.use(cors());

server.listen(5000,()=>{
    console.log("Server is running on port 5000")
})