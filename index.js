import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
dotenv.config();

const uri = process.env.MONGODB_URI;
const port = process.env.PORT || 5001;


// MIDDLEWARES
app.use(cors());
app.use(express.json());

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
)

const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized' })
    }
    const token = authHeader.split(' ')[1]
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' })
    }
    // console.log(token);
    try {
        const { payload } = await jwtVerify(token, JWKS)
        // console.log('payload', payload);
        req.user = payload;
        next()
    } catch (error) {
        return res.status(403).json({ message: 'Forbidden' });
    }
}



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
        // await client.connect();

        const database = client.db("SportsHub");
        const facilitiesCollection = database.collection("facilities");
        const bookingsCollection = database.collection("bookings");

        // get all facilities [public]
        app.get('/facilities', async (req, res) => {
            try {
                const { searchQuery = null, sportsType = null } = req.query;
                let cursor = null;

                if (searchQuery === null && sportsType === null) {
                    cursor = facilitiesCollection.find();
                }
                else {
                    let filter = {};

                    if (searchQuery) {
                        filter.facilityName = { $regex: searchQuery, $options: 'i' };
                    }

                    if (sportsType) {
                        filter.facilityType = sportsType;
                    }

                    cursor = facilitiesCollection.find(filter);
                }
                
                const result = await cursor.toArray();

                res.send(result);

            } catch (error) {
                console.log(error)
                res.status(500).send({ error: 'Failed to load facilities' });
            }
        });

        // get featured facilities (featuredPosition 1-8) [public]
        app.get('/featured-facilities', async (req, res) => {
            const cursor = facilitiesCollection.find({ featuredPosition: { $gte: 1, $lte: 8 } }).sort({ featuredPosition: 1 });
            const result = await cursor.toArray();
            res.send(result);
        });


        // creates facility [private]
        app.post('/facilities', verifyToken, async (req, res) => {
            const newFacility = req.body;
            const result = await facilitiesCollection.insertOne(newFacility);

            res.send(result);
            // res.json(result);
        });

        // get user created facilities on manage page
        app.get('/manage-facilities', verifyToken, async (req, res) => {
            try {
                const userEmail = req.user?.email;

                if (!userEmail) {
                    return res.status(400).json({ message: 'User not found.' });
                }

                const query = { owner: userEmail };
                const cursor = facilitiesCollection.find(query).sort({ updatedAt: -1 });
                const result = await cursor.toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: 'Failed to fetch your facilities' });
            }
        });

        // get a single facility [public] 
        app.get('/all-facilities/:facilityId', async (req, res) => {
            const facilityId = req.params.facilityId;
            const facility = await facilitiesCollection.findOne({ _id: new ObjectId(facilityId) });
            res.send(facility);
        });

        // update facility [private]
        app.patch('/manage-facilities/edit/:facilityId', verifyToken, async (req, res) => {
            const facilityId = req.params.facilityId;
            const updatedData = req.body;
            const targetFacility = await facilitiesCollection.findOne({ _id: new ObjectId(facilityId) });
            if (targetFacility.owner === req.user.email) {
                const result = await facilitiesCollection.updateOne({ _id: new ObjectId(facilityId) }, { $set: updatedData });
                res.send(result);
            }
            else {
                return res.status(401).json({ message: 'Unauthorized' })
            }
        });


        // deleting a single facility [private]
        app.delete('/manage-facilities/delete/:facilityId', verifyToken, async (req, res) => {
            const facilityId = req.params.facilityId;
            const targetFacility = await facilitiesCollection.findOne({ _id: new ObjectId(facilityId) });
            if (targetFacility.owner === req.user.email) {
                const deletedFacility = await facilitiesCollection.deleteOne({ _id: new ObjectId(facilityId) });
                res.send(deletedFacility);
            };
        });

        // get user added bookings [private]
        app.get('/my-bookings', verifyToken, async (req, res) => {
            try {
                const userEmail = req.user?.email;

                if (!userEmail) {
                    return res.status(400).json({ message: 'User not found.' });
                }

                const query = { userEmail: userEmail };
                const cursor = bookingsCollection.find(query).sort({ createdAt: -1 });
                const result = await cursor.toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: 'Failed to fetch your bookings' });
            }
        });

        // creates a booking [private]
        app.post('/bookings', verifyToken, async (req, res) => {
            try {
                const newBooking = req.body;
                const { facilityId, bookingDate, timeSlot } = newBooking;

                if (!facilityId || !bookingDate || !timeSlot) {
                    return res.status(400).json({ message: 'Missing booking fields' });
                }

                const query = {
                    facilityId,
                    bookingDate,
                    timeSlot,
                };

                const existing = await bookingsCollection.findOne(query);
                if (existing) {
                    return res.status(409).json({ message: 'Already booked' });
                }


                newBooking.createdAt = new Date().toISOString();
                newBooking.userEmail = req.user?.email;

                const result = await bookingsCollection.insertOne(newBooking);

                await facilitiesCollection.updateOne(
                    { _id: new ObjectId(facilityId) },
                    { $inc: { bookingCount: 1 } }
                );

                res.send(result);
            } catch (error) {
                console.error('Failed to create booking', error);
                res.status(500).json({ message: 'Failed to create booking' });
            }
        });

        // cancel booking [private]
        app.patch('/bookings/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            const targetBooking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
            if (targetBooking.userEmail === req.user.email) {
                const result = await bookingsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });

                res.send(result);
            }
        });


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// ROUTES
app.get('/', (req, res) => {
    res.send('Server is live...');
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`)
})