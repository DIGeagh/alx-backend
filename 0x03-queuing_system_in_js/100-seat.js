import express from 'express';
import kue from 'kue';
import { createClient } from 'redis';
import { promisify } from 'util';

const app = express();
const queue = kue.createQueue();
const client = createClient();

// Promisify Redis methods
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);

// Initialize seats and reservation status
let reservationEnabled = true;

// Function to set the initial number of seats
const reserveSeat = (number) => setAsync('available_seats', number);

// Function to get the current number of available seats
const getCurrentAvailableSeats = async () => {
  const seats = await getAsync('available_seats');
  return parseInt(seats, 10);
};

// Route to get the number of available seats
app.get('/available_seats', async (req, res) => {
  const seats = await getCurrentAvailableSeats();
  res.json({ numberOfAvailableSeats: seats });
});

// Route to reserve a seat
app.get('/reserve_seat', (req, res) => {
  if (!reservationEnabled) {
    return res.json({ status: 'Reservation are blocked' });
  }

  const job = queue.create('reserve_seat').save((err) => {
    if (err) {
      return res.json({ status: 'Reservation failed' });
    }
    res.json({ status: 'Reservation in process' });
  });

  job.on('complete', () => {
    console.log(`Seat reservation job ${job.id} completed`);
  });

  job.on('failed', (err) => {
    console.log(`Seat reservation job ${job.id} failed: ${err}`);
  });
});

// Route to process the queue
app.get('/process', (req, res) => {
  res.json({ status: 'Queue processing' });

  queue.process('reserve_seat', async (job, done) => {
    const seats = await getCurrentAvailableSeats();

    if (seats <= 0) {
      reservationEnabled = false;
      return done(new Error('Not enough seats available'));
    }

    await reserveSeat(seats - 1);
    if (seats - 1 === 0) {
      reservationEnabled = false;
    }

    done();
  });
});

// Initialize the server and set available seats to 50
const PORT = 1245;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await reserveSeat(50);
});

