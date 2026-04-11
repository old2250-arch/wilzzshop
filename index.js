const express = require('express');
const path = require('path');
const app = express();

// Menampilkan file html saat rute utama dibuka
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Port listener (opsional untuk local)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
