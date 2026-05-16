# Requirements Document

## Introduction

Batch Entry & Bulk Edit enables users to paste multiple rows of lecture data (from Excel, WhatsApp messages, or plain text) into the application, preview and edit them in a grid, apply common field values (like Date and Time) in bulk, and submit all rows to a Google Sheet in a single batch operation. This feature eliminates the tedious one-row-at-a-time entry workflow when users have lists of lectures ready to enter.

## Glossary

- **Bulk_Edit_Page**: The dedicated page accessible from the sidebar navigation that hosts the Smart Paste area, preview grid, and batch submission controls
- **Smart_Paste_Area**: A large text input area where users paste multi-row data copied from Excel, WhatsApp, or plain text sources
- **Text_Parser**: The frontend module responsible for splitting pasted text into individual rows and mapping columns based on delimiter detection (tabs, commas, newlines)
- **Preview_Grid**: An editable table component that displays parsed rows before submission, allowing inline corrections
- **Bulk_Apply_Controls**: UI controls (Date picker, Time picker) that set a common value across all rows in the preview grid simultaneously
- **Batch_Append_Endpoint**: The backend API endpoint (`/api/sheet/batch-append`) that accepts an array of rows and appends them to a Google Sheet in one operation
- **Row_Data**: A single parsed row represented as a dictionary mapping column headers to cell values
- **Delimiter**: A character (tab `\t`, comma `,`, or pipe `|`) used to separate columns within a pasted line of text

## Requirements

### Requirement 1: Sidebar Navigation Entry

**User Story:** As a user, I want to access the Bulk Edit feature from the sidebar navigation menu, so that I can quickly find and use it alongside other app features.

#### Acceptance Criteria

1. THE Bulk_Edit_Page SHALL be accessible via a "Bulk Edit" menu item in the AppHeader navigation menu, positioned immediately after the "Data Correction" item and before the "Quick View" item
2. WHEN the user clicks the "Bulk Edit" navigation item, THE Application SHALL close the navigation menu and navigate to the `/bulk-edit` route
3. THE Bulk_Edit_Page SHALL display the shared AppHeader component with the title "Bulk Edit" and a back navigation option that returns the user to the previous page in browser history, or to the dashboard (`/dashboard`) if no history entry exists

### Requirement 2: Smart Paste Input

**User Story:** As a user, I want to paste multiple rows of lecture data from various sources (Excel, WhatsApp, plain text), so that I can enter many rows at once without typing each one individually.

#### Acceptance Criteria

1. THE Bulk_Edit_Page SHALL display a Smart_Paste_Area as a multi-line text input with a minimum visible height of 6 text rows and placeholder text indicating supported formats (Excel, WhatsApp, plain text)
2. THE Smart_Paste_Area SHALL accept pasted content of at least 100 rows and up to 50,000 characters without truncation
3. WHEN the Smart_Paste_Area contains at least one non-whitespace character AND a target Google Sheet is selected, THE Bulk_Edit_Page SHALL enable the "Parse" button to allow the user to trigger parsing
4. IF the Smart_Paste_Area is empty OR no target Google Sheet is selected, THEN THE Bulk_Edit_Page SHALL disable the "Parse" button and indicate which precondition is unmet
5. THE Bulk_Edit_Page SHALL provide a target Google Sheet selector (via URL text input or saved sheet dropdown) positioned before the Smart_Paste_Area, and SHALL validate that the URL matches a Google Sheets URL pattern before enabling parsing

### Requirement 3: Text Parsing and Delimiter Detection

**User Story:** As a user, I want the system to automatically detect how my pasted data is structured, so that columns are correctly identified without manual configuration.

#### Acceptance Criteria

1. WHEN pasted content contains tab characters (`\t`), THE Text_Parser SHALL use tabs as the column delimiter
2. WHEN pasted content contains no tabs but contains commas, THE Text_Parser SHALL use commas as the column delimiter, treating commas enclosed within double-quoted field values (`"..."`) as literal characters rather than delimiters
3. WHEN pasted content contains neither tabs nor commas, THE Text_Parser SHALL treat each line as a single-column row
4. THE Text_Parser SHALL split content by newline characters (`\n` or `\r\n`) to identify individual rows, supporting pasted content up to 100,000 characters in length
5. THE Text_Parser SHALL ignore empty lines during parsing, where an empty line is defined as a line containing zero characters or only whitespace characters (spaces and tabs)
6. THE Text_Parser SHALL trim leading and trailing whitespace characters (spaces and tabs) from each parsed cell value
7. WHEN the parsed column count matches the target sheet's header count, THE Text_Parser SHALL auto-map columns to sheet headers in order
8. WHEN the parsed column count does not match the target sheet's header count, THE Bulk_Edit_Page SHALL display a column mapping interface allowing the user to assign parsed columns to sheet headers
9. IF the pasted content is empty or contains only whitespace characters after trimming, THEN THE Text_Parser SHALL not produce any rows and THE Bulk_Edit_Page SHALL display an error message indicating that no parseable data was found

### Requirement 4: Preview Grid Display

**User Story:** As a user, I want to see all my parsed rows in an editable table before submitting, so that I can verify the data is correct and make corrections.

#### Acceptance Criteria

1. WHEN parsing completes successfully with one or more rows, THE Preview_Grid SHALL display all parsed rows in a tabular format with sheet headers as column names
2. WHEN the user activates a cell (click or tap), THE Preview_Grid SHALL make that cell editable as a text input field with a maximum length of 1000 characters
3. THE Preview_Grid SHALL display a row number column as the first column, showing sequential integers starting from 1
4. THE Preview_Grid SHALL display empty cells with a distinct background color or placeholder indicator that differs from cells containing values, so that empty cells are identifiable without selecting them
5. WHEN the user activates the delete action on a row, THE Preview_Grid SHALL remove that row from the displayed batch immediately without requiring a confirmation step
6. WHEN the Preview_Grid contains more than 15 rows, THE Preview_Grid SHALL provide vertical scrolling while keeping the header row fixed at the top of the grid viewport
7. IF parsing completes with zero data rows, THEN THE Preview_Grid SHALL display a message indicating no data rows were found in the sheet
8. THE Preview_Grid SHALL display the total number of rows currently in the batch above or below the table

### Requirement 5: Bulk Apply Common Fields

**User Story:** As a user, I want to set a common Date or Time value and apply it to all rows at once, so that I do not have to edit each row individually for shared fields.

#### Acceptance Criteria

1. WHEN the user selects a date value in the Bulk_Apply_Controls Date picker and confirms the apply action, THE Preview_Grid SHALL set the date column value for all rows to the selected value
2. WHEN the user selects a time value in the Bulk_Apply_Controls Time picker and confirms the apply action, THE Preview_Grid SHALL set the time column value for all rows to the selected value
3. THE Bulk_Apply_Controls SHALL only display pickers for columns that exist in the target sheet's headers and are classified as date or time type by the application's field type inference logic
4. IF the Preview_Grid contains zero rows, THEN THE Bulk_Apply_Controls SHALL be disabled and not allow apply actions
5. WHEN the user applies a bulk value, THE Preview_Grid SHALL update all affected cells within 500 milliseconds and distinguish bulk-applied cells from individually-edited cells using a visible style difference (e.g., background color or text decoration)
6. WHEN the user clears a bulk-applied value via the Bulk_Apply_Controls, THE Preview_Grid SHALL revert each affected cell to the value it held before the bulk apply was performed, including empty if the cell had no prior value

### Requirement 6: Batch Submission to Google Sheets

**User Story:** As a user, I want to submit all rows to my Google Sheet in one click, so that the process is fast and I do not have to submit rows one by one.

#### Acceptance Criteria

1. THE Bulk_Edit_Page SHALL provide a "Submit All" button that sends all rows in the Preview_Grid to the target Google Sheet, and SHALL disable the "Submit All" button when the Preview_Grid contains zero rows
2. WHEN the user clicks "Submit All", THE Batch_Append_Endpoint SHALL receive the complete array of rows in a single API request
3. THE Batch_Append_Endpoint SHALL append all rows to the target worksheet using the Google Sheets batch append API (`worksheet.append_rows`)
4. WHILE the batch submission is in progress, THE Bulk_Edit_Page SHALL display a loading indicator and disable the "Submit All" button to prevent duplicate submissions
5. WHEN the batch submission succeeds, THE Bulk_Edit_Page SHALL display a success message indicating the number of rows appended and SHALL clear all rows from the Preview_Grid
6. IF the batch submission fails, THEN THE Bulk_Edit_Page SHALL display an error message with the failure reason and retain all row data in the Preview_Grid so the user can retry
7. THE Batch_Append_Endpoint SHALL sanitize all cell values by prefixing any cell whose first character is one of `=`, `+`, `-`, `@`, tab, or carriage-return with a leading apostrophe to prevent formula injection before appending to the sheet
8. IF the batch submission partially succeeds (some rows appended before an error occurs), THEN THE Bulk_Edit_Page SHALL display an error message indicating how many rows were successfully appended and SHALL retain only the un-appended rows in the Preview_Grid so the user can retry without duplicating data

### Requirement 7: Backend Batch Append API

**User Story:** As a developer, I want a dedicated batch append endpoint, so that the frontend can submit multiple rows efficiently in one network round-trip.

#### Acceptance Criteria

1. THE Batch_Append_Endpoint SHALL accept a POST request at `/api/sheet/batch-append` with a JSON body containing `sheet_url`, `worksheet_name` (optional), and `rows` (array of row objects where each key corresponds to a column header name)
2. THE Batch_Append_Endpoint SHALL validate that `rows` is a non-empty array with a minimum of 1 and a maximum of 200 row objects per request, and that each row object contains only string values with a maximum value length of 5000 characters
3. THE Batch_Append_Endpoint SHALL read the target sheet's header row to map row object keys to column positions
4. THE Batch_Append_Endpoint SHALL use the existing `_build_row_from_headers` logic to ensure values land in correct columns regardless of column order
5. IF the `sheet_url` is invalid or inaccessible, THEN THE Batch_Append_Endpoint SHALL return HTTP 400 with an error message indicating the reason the sheet could not be accessed
6. IF Google Sheets API returns a rate limit error (HTTP 429), THEN THE Batch_Append_Endpoint SHALL retry once after a 2-second delay, and IF the retry also fails, THEN THE Batch_Append_Endpoint SHALL return HTTP 429 with an error message indicating the rate limit was exceeded
7. WHEN all rows are successfully appended, THE Batch_Append_Endpoint SHALL invalidate the rows cache and headers cache for the affected sheet and return HTTP 200 with a JSON body containing `success` (boolean), `appended_count` (integer equal to the number of rows written), and `updated_range` (string indicating the appended cell range)
8. IF any row object contains a key that does not match any column header in the target sheet, THEN THE Batch_Append_Endpoint SHALL skip that key's value for the unmatched column and append the row using only the matched keys
9. IF the append operation fails for a reason other than rate limiting, THEN THE Batch_Append_Endpoint SHALL return HTTP 500 with an error message indicating the append failure reason, and no partial rows shall be persisted to the sheet

### Requirement 8: Input Validation and Error Handling

**User Story:** As a user, I want clear feedback when my pasted data has issues, so that I can fix problems before attempting submission.

#### Acceptance Criteria

1. IF the Smart_Paste_Area is empty when the user attempts to parse, THEN THE Bulk_Edit_Page SHALL display a validation message indicating that content is required, positioned adjacent to the Smart_Paste_Area, and the message SHALL remain visible until the user enters content or initiates a new parse action
2. IF no target sheet is selected when the user attempts to parse, THEN THE Bulk_Edit_Page SHALL display a validation message indicating that a sheet must be selected first, positioned adjacent to the sheet selection control, and the message SHALL remain visible until a sheet is selected
3. IF the parsed content results in zero valid rows, THEN THE Bulk_Edit_Page SHALL display a message indicating no rows could be parsed from the input, and SHALL not display the Preview_Grid
4. WHEN the Preview_Grid contains rows, THE Bulk_Edit_Page SHALL display the total row count as a numeric label (e.g., "12 rows") visible above or below the Preview_Grid
5. WHEN parsing completes and the Preview_Grid is displayed, THE Bulk_Edit_Page SHALL check each row for empty values in required columns (as defined by the sheet's field schema) and SHALL apply a distinct background color to those empty cells to differentiate them from valid cells
6. IF the user edits a previously highlighted empty required-column cell and provides a non-empty value, THEN THE Bulk_Edit_Page SHALL remove the highlight from that cell within 1 second of the edit
7. IF parse-time validation fails (empty paste area or no sheet selected), THEN THE Bulk_Edit_Page SHALL retain any previously displayed Preview_Grid data without clearing it
