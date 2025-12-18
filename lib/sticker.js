const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')

exports.toSticker = (input, output) => {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        "-vcodec", "libwebp",
        "-vf", "scale=512:512:force_original_aspect_ratio=increase,fps=15,crop=512:512",
        "-lossless", "1",
        "-loop", "0",
        "-preset", "default",
        "-an", "-vsync", "0"
      ])
      .save(output)
      .on('end', resolve)
      .on('error', reject)
  })
}
