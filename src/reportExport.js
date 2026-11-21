const encoder = new TextEncoder()

function reportTables(data, reportDates) {
  const topFruits = data.topFruits.items || []
  const stockLevels = data.stockLevels.items || []
  const topVendor = data.topVendor.vendor
  const revenue = data.revenue
  return [
    {
      name: 'Top Fruits',
      rows: [
        ['Rank', 'Fruit', 'Boxes sold', 'Number of sales'],
        ...topFruits.map((item, index) => [
          index + 1,
          item.fruitName,
          Number(item.totalBoxesSold),
          Number(item.numberOfSales),
        ]),
      ],
    },
    {
      name: 'Revenue',
      currencyCells: [[4, 1], [5, 1], [6, 1]],
      rows: [
        ['Metric', 'Value'],
        ['Start date', reportDates.startDate],
        ['End date', reportDates.endDate],
        ['Completed sales', Number(revenue.completedSalesCount)],
        ['Total revenue (M)', Number(revenue.totalSalesRevenue)],
        ['Collected (M)', Number(revenue.totalAmountCollected)],
        ['Uncollected (M)', Number(revenue.totalUncollectedInRange)],
      ],
    },
    {
      name: 'Top Vendor',
      currencyCells: [[1, 4]],
      rows: [
        ['Vendor', 'Location', 'Phone', 'Boxes purchased', 'Outstanding balance (M)'],
        ...(topVendor
          ? [[
            topVendor.vendorName,
            topVendor.location,
            topVendor.phoneNumber,
            Number(topVendor.totalBoxesPurchased),
            Number(topVendor.outstandingBalance),
          ]]
          : [['No vendor sales recorded', '', '', '', '']]),
      ],
    },
    {
      name: 'Stock Levels',
      currencyCells: stockLevels.map((item, index) => [index + 1, 3]),
      rows: [
        ['Fruit', 'Packaging size', 'Boxes available', 'Price per box (M)', 'Status'],
        ...stockLevels.map((item) => [
          item.fruitName,
          item.packagingSize,
          Number(item.availableQuantity),
          Number(item.unitSellingPrice),
          item.stockStatus,
        ]),
      ],
    },
  ]
}

function csvCell(value, currency) {
  let text = value ?? ''
  if (currency && text !== '') {
    text = `M ${Number(text).toLocaleString('en-LS', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  text = String(text)
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(value)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function tableCsv(table) {
  return table.rows.map((row, rowIndex) => row.map((value, columnIndex) => {
    const currency = table.currencyCells?.some(([currencyRow, currencyColumn]) => (
      currencyRow === rowIndex && currencyColumn === columnIndex
    ))
    return csvCell(value, currency)
  }).join(',')).join('\r\n')
}

export function createReportCsv(data, reportDates) {
  const sections = reportTables(data, reportDates).map((table) => (
    `${csvCell(table.name)}\r\n${tableCsv(table)}`
  ))
  return `\uFEFF${sections.join('\r\n\r\n')}\r\n`
}

function columnName(index) {
  let number = index + 1
  let name = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    number = Math.floor((number - 1) / 26)
  }
  return name
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function worksheetXml(table) {
  const widths = table.rows[0].map((_, columnIndex) => Math.min(42, Math.max(
    12,
    ...table.rows.map((row) => String(row[columnIndex] ?? '').length + 2),
  )))
  const columns = widths.map((width, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  )).join('')
  const currencyCells = new Set((table.currencyCells || []).map(([row, column]) => `${row}:${column}`))
  const rows = table.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`
      const style = rowIndex === 0 ? ' s="1"' : currencyCells.has(`${rowIndex}:${columnIndex}`) ? ' s="2"' : ''
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${reference}"${style}><v>${value}</v></c>`
      }
      return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value ?? '')}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${columns}</cols><sheetData>${rows}</sheetData></worksheet>`
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(bytes) {
  let crc = 0xFFFFFFFF
  bytes.forEach((byte) => { crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8) })
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function zipHeader(size, signature) {
  const bytes = new Uint8Array(size)
  new DataView(bytes.buffer).setUint32(0, signature, true)
  return new DataView(bytes.buffer)
}

function zipStore(files) {
  const localParts = []
  const centralParts = []
  let offset = 0

  Object.entries(files).forEach(([path, content]) => {
    const name = encoder.encode(path)
    const bytes = encoder.encode(content)
    const checksum = crc32(bytes)
    const local = zipHeader(30, 0x04034B50)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(8, 0, true)
    local.setUint16(10, 0, true)
    local.setUint16(12, 0x21, true)
    local.setUint32(14, checksum, true)
    local.setUint32(18, bytes.length, true)
    local.setUint32(22, bytes.length, true)
    local.setUint16(26, name.length, true)
    localParts.push(new Uint8Array(local.buffer), name, bytes)

    const central = zipHeader(46, 0x02014B50)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, 0, true)
    central.setUint16(14, 0x21, true)
    central.setUint32(16, checksum, true)
    central.setUint32(20, bytes.length, true)
    central.setUint32(24, bytes.length, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, offset, true)
    centralParts.push(new Uint8Array(central.buffer), name)
    offset += 30 + name.length + bytes.length
  })

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const end = zipHeader(22, 0x06054B50)
  const count = Object.keys(files).length
  end.setUint16(8, count, true)
  end.setUint16(10, count, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)]).arrayBuffer()
}

export async function createReportXlsx(data, reportDates) {
  const tables = reportTables(data, reportDates)
  const sheetEntries = tables.map((table, index) => (
    `<sheet name="${xmlEscape(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  )).join('')
  const sheetRelations = tables.map((_, index) => (
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  )).join('')
  const contentOverrides = tables.map((_, index) => (
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )).join('')
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentOverrides}</Types>`,
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelations}<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;M&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ...Object.fromEntries(tables.map((table, index) => [
      `xl/worksheets/sheet${index + 1}.xml`,
      worksheetXml(table),
    ])),
  }
  return zipStore(files)
}

function reportFilename(reportDates, extension) {
  return `batloung-farm-reports-${reportDates.startDate}-to-${reportDates.endDate}.${extension}`
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadReportCsv(data, reportDates) {
  download(
    reportFilename(reportDates, 'csv'),
    new Blob([createReportCsv(data, reportDates)], { type: 'text/csv;charset=utf-8' }),
  )
}

export async function downloadReportXlsx(data, reportDates) {
  const bytes = await createReportXlsx(data, reportDates)
  download(
    reportFilename(reportDates, 'xlsx'),
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
}
