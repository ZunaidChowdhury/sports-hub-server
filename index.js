import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { MongoClient, ServerApiVersion } from 'mongodb';

const app = express();
dotenv.config();

const uri = process.env.MONGODB_URI;
const port = process.env.PORT || 5001;


// MIDDLEWARES
app.use(cors());
app.use(express.json());


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server (optional starting in v4.7)
        await client.connect();

        const database = client.db("SportsHub");
        const facilitiesCollection = database.collection("facilities");

        // get all facilities
        app.get('/facilities', async (req, res) => {
            const cursor = facilitiesCollection.find();
            const result = await cursor.toArray();
            res.send(result);
            // res.json(result);
        });

        // get featured facilities (featuredPosition 1-8)
        app.get('/featured-facilities', async (req, res) => {
            const cursor = facilitiesCollection.find({ featuredPosition: { $gte: 1, $lte: 8 } }).sort({ featuredPosition: 1 });
            const result = await cursor.toArray();
            res.send(result);
        });

        // create a single user
        app.post('/facilities', async (req, res) => {
            const newFacility = req.body;
            console.log('server/newFacility: ', newFacility);
            const result = await facilitiesCollection.insertOne(newFacility);
            console.log('server/result: ', result);

            res.send(result);
            // res.json(result);
        });





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// ROUTES
app.get('/', (req, res) => {
    res.send('Respond from home');
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`)
})