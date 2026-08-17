const express = require('express');
const path = require('path');

const PORT = 3456;
const app = express();
app.use(express.static(path.resolve(__dirname, '..')));
app.listen(PORT);
