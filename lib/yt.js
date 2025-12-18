const ytdl = require('ytdl-core')
const fs = require('fs')

exports.downloadMp3 = (url, path) => {
  return new Promise((resolve) => {
    ytdl(url, { filter: 'audioonly' })
      .pipe(fs.createWriteStream(path))
      .on('finish', resolve)
  })
}
