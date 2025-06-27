const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  id: String,
  name: String,
  email: String,
  company: String,
  location: String,
  template: String,
  videoUrl: String,
  qrPath: String,
  pageUrl: String,
}, { timestamps: true });

module.exports = mongoose.model('Submission', submissionSchema);