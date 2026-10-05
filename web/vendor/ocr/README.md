Tesseract.js 5 (Apache-2.0), tesseract.js-core LSTM build, English 'best_int' model.
Bundled so screenshots are read on the user's device.
One local patch in worker.min.js: `initialize` joins language codes (`t.code`) instead of `t.data`, so the model can be passed in as bytes.
