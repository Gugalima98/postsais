
// Extract ID from URL like https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjGMUUqptlbs74OgvE2upms/edit
export const extractSheetId = (urlOrId: string): string | null => {
    const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : (urlOrId.length > 20 ? urlOrId : null);
};

export const fetchSheetRows = async (accessToken: string, spreadsheetId: string) => {
    // Fetches columns A to E. Using 'A2:E' lets Google determine the last row automatically.
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:E`, 
        {
            headers: { Authorization: `Bearer ${accessToken}` }
        }
    );

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Erro ao ler a planilha');
    }

    const data = await response.json();
    return data.values || [];
};

export const updateSheetCell = async (accessToken: string, spreadsheetId: string, rowIndex: number, value: string, columnLetter: string = 'F') => {
    // Writes to specific Column (default F) at the specific row
    // rowIndex is 0-based index from the data array.
    // Since we started reading at A2, row 0 in data is Row 2 in Sheet.
    const sheetRow = rowIndex + 2; 
    const range = `${columnLetter}${sheetRow}`;

    const body = {
        values: [[value]]
    };

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
            method: 'PUT',
            headers: { 
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        throw new Error('Erro ao atualizar a planilha');
    }
};
