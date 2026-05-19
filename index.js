import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 5000;


// MIDDLEWARES
app.use(cors());
app.use(express.json());


// ROUTES
app.get('/', (req, res) => {
    res.send('Respond from home');
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`)
})