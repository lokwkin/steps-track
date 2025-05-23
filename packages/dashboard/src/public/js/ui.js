/**
 * UI manipulation functions for StepsTrack Portal
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ui = {
  /**
   * Show a specific view and update UI accordingly
   * @param {string} viewId - The ID of the view to show
   */
  showView(viewId) {
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');

    // Update active navigation link
    navLinks.forEach((link) => {
      link.classList.remove('active');
      if (link.getAttribute('data-view') === viewId) {
        link.classList.add('active');
      }
    });

    // Show the selected view
    views.forEach((view) => {
      view.classList.remove('active');
      if (view.id === viewId) {
        view.classList.add('active');
        app.state.currentView = viewId;

        // Update URL with the current view
        const url = new URL(window.location);
        // Map view IDs (HTML element IDs) to URL parameter values
        const urlViewParam =
          viewId === 'runs-view'
            ? 'runs-view'
            : viewId === 'run-detail-view'
              ? 'run-detail'
              : viewId === 'step-stats-view'
                ? 'step-stats-view'
                : viewId === 'step-analysis-view'
                  ? 'step-analysis'
                  : viewId === 'import-view'
                    ? 'import'
                    : viewId === 'settings-view'
                      ? 'settings'
                      : viewId;
        url.searchParams.set('view', urlViewParam);

        // Update page title based on current view
        const pageTitle = document.getElementById('page-title');
        if (viewId === 'runs-view') {
          pageTitle.textContent = 'Pipeline Runs';
        } else if (viewId === 'step-stats-view') {
          pageTitle.textContent = 'Step Execution Stats';

          // Set up custom column event listeners for step stats view
          this.setupStepStatsCustomColumnListeners();

          // Update custom columns dropdown for step stats
          app.updateStepStatsColumnsDropdown();
        } else if (viewId === 'import-view') {
          pageTitle.textContent = 'Import Pipeline Files';
        } else if (viewId === 'settings-view') {
          pageTitle.textContent = 'Settings';
        }

        // Get state from URL parameters
        const params = new URLSearchParams(window.location.search);
        const selectedPipeline = params.get('pipeline');
        const selectedStepName = params.get('stepName');

        // Load data based on the current view and selected pipeline
        if (selectedPipeline) {
          if (viewId === 'runs-view') {
            this.loadRuns(selectedPipeline);
          } else if (viewId === 'step-stats-view') {
            // Always load step names first to populate the dropdown
            this.loadStepNames(selectedPipeline).then(() => {
              // If a step name is selected in the URL params, load its data
              if (selectedStepName) {
                this.loadStepTimeSeries(selectedPipeline, selectedStepName);
              } else {
                // Hide step stats content if no step selected
                document.getElementById('step-stats-summary').classList.add('d-none');
                document.getElementById('step-time-series-chart-container').classList.add('d-none');
                document.getElementById('step-stats-table').querySelector('tbody').innerHTML =
                  '<tr><td colspan="4" class="text-center py-4">Select a step to view statistics</td></tr>';
              }
            });
          } else if (viewId === 'settings-view') {
            // Settings view is currently blank
          }
          // No data loading needed for import-view
        } else if (viewId === 'settings-view') {
          // Settings view is currently blank
        }

        // Update browser history
        window.history.pushState({ view: urlViewParam }, '', url);
      }
    });
  },

  /**
   * Show run details for a specific run
   * @param {string} runId - Run ID
   */
  showRunDetails(runId) {
    // Reset expanded rows when navigating to a different run
    const params = new URLSearchParams(window.location.search);
    const currentRunId = params.get('runId');

    if (currentRunId !== runId) {
      app.state.expandedRows = new Set(); // Keep this in memory state as specified

      // Restart auto-refresh if enabled to pick up the new runId
      if (app.state.autoRefresh) {
        app.stopAutoRefresh();
      }
    }

    // Switch to run detail view
    this.showView('run-detail-view');

    // Update URL - showView has already set the view parameter
    const url = new URL(window.location);
    url.searchParams.set('runId', runId);
    window.history.replaceState({ view: 'run-detail', runId }, '', url);

    // Update page title
    document.getElementById('page-title').textContent = `Run Details: ${runId}`;

    // Load run details (not an auto-refresh)
    this.loadRunDetails(runId, false);

    // Restart auto-refresh if it was enabled
    if (app.state.autoRefresh) {
      app.startAutoRefresh();
    }
  },

  /**
   * Show step analysis details
   * @param {Object} step - Step object
   */
  showStepAnalysis(step) {
    // Switch to step analysis view
    this.showView('step-analysis-view');

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('view', 'step-analysis');

    // Get runId from URL parameters
    const params = new URLSearchParams(window.location.search);
    const runId = params.get('runId');

    url.searchParams.set('runId', runId);
    url.searchParams.set('stepKey', step.key);
    window.history.pushState({ view: 'step-analysis', runId, stepKey: step.key }, '', url);

    // Update page title
    document.getElementById('page-title').textContent = `Step Analysis: ${step.name}`;

    // Update details
    const stepAnalysisDetails = document.getElementById('step-analysis-details');
    stepAnalysisDetails.innerHTML = `
      <p><strong>Step Key:</strong> ${step.key}</p>
      <p><strong>Start Time:</strong> ${utils.formatDateTime(step.time.startTs)}</p>
      <p><strong>End Time:</strong> ${utils.formatDateTime(step.time.endTs)}</p>
      <p><strong>Duration:</strong> ${utils.formatDuration(step.time.timeUsageMs)}</p>
    `;
  },

  /**
   * Load and display pipeline runs in the runs table
   * @param {string} pipeline - Pipeline name
   */
  async loadRuns(pipeline) {
    const runsTable = document.getElementById('runs-table').querySelector('tbody');
    const paginationRange = document.getElementById('pagination-range');
    const prevButton = document.getElementById('pagination-prev');
    const nextButton = document.getElementById('pagination-next');
    const pageSizeSelect = document.getElementById('pagination-page-size');
    const paginationContainer = document.getElementById('runs-pagination');
    const runIdSearchInput = document.getElementById('run-id-search');

    // Initialize pagination state if it doesn't exist
    if (!app.state.pagination) {
      app.state.pagination = {
        page: 1,
        pageSize: 10,
      };
    }

    try {
      // Show loading state
      runsTable.innerHTML = '<tr><td colspan="6" class="text-center py-4">Loading runs...</td></tr>';
      paginationContainer.classList.add('d-none');

      // Get date range from URL parameters
      const params = new URLSearchParams(window.location.search);
      const timePreset = params.get('timePreset') || app.state.globalDateRange.timePreset;
      const startDate = params.get('startDate') || app.state.globalDateRange.startDate;
      const endDate = params.get('endDate') || app.state.globalDateRange.endDate;

      const dateRange = {
        timePreset,
        startDate,
        endDate,
      };

      // Set page size from select or default
      const pageSize = parseInt(pageSizeSelect.value, 10) || app.state.pagination.pageSize;
      app.state.pagination.pageSize = pageSize;

      // Get Run ID search value
      const runIdSearch = runIdSearchInput.value.trim();

      // Fetch data with pagination and search
      const response = await api.loadRuns(pipeline, dateRange, app.state.pagination, runIdSearch);
      const runs = response.items;
      const pagination = response.pagination;

      // Update app state with the pagination info from the response
      app.state.pagination = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
      };

      if (!runs?.length) {
        runsTable.innerHTML = '<tr><td colspan="6" class="text-center py-4">No runs found</td></tr>';
        paginationContainer.classList.add('d-none');
        return;
      }

      // Show pagination container
      paginationContainer.classList.remove('d-none');

      // Update pagination info
      const start = (pagination.page - 1) * pagination.pageSize + 1;
      const end = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
      paginationRange.textContent = `Showing ${start}-${end} of ${pagination.totalItems} runs`;

      // Enable/disable pagination buttons
      prevButton.disabled = pagination.page <= 1;
      nextButton.disabled = pagination.page >= pagination.totalPages;

      // Set the page size select value
      pageSizeSelect.value = pagination.pageSize.toString();

      // Render table rows
      runsTable.innerHTML = '';
      runs.forEach((run) => {
        const startTime = utils.formatDateTime(run.startTime);
        const endTime = run.endTime ? utils.formatDateTime(run.endTime) : 'In progress';
        const duration = utils.formatDuration(run.duration);

        let statusClass = '';
        if (run.status === 'completed') {
          statusClass = 'status-success';
        } else if (run.status === 'failed') {
          statusClass = 'status-error';
        } else if (run.status === 'running') {
          statusClass = 'status-running';
        }

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${run.runId}</td>
          <td>${run.pipeline}</td>
          <td>${startTime}</td>
          <td>${endTime}</td>
          <td>${duration}</td>
          <td class="${statusClass}">${run.status}</td>
        `;

        row.addEventListener('click', () => {
          this.showRunDetails(run.runId);
        });

        runsTable.appendChild(row);
      });

      // Set up pagination event handlers (only once)
      if (!app.state.paginationEventsInitialized) {
        // Previous page button
        prevButton.addEventListener('click', () => {
          if (app.state.pagination.page > 1) {
            app.state.pagination.page--;
            this.loadRuns(pipeline);
          }
        });

        // Next page button
        nextButton.addEventListener('click', () => {
          if (app.state.pagination.page < app.state.pagination.totalPages) {
            app.state.pagination.page++;
            this.loadRuns(pipeline);
          }
        });

        // Page size select
        pageSizeSelect.addEventListener('change', () => {
          app.state.pagination.pageSize = parseInt(pageSizeSelect.value, 10);
          app.state.pagination.page = 1; // Reset to first page when changing page size
          this.loadRuns(pipeline);
        });

        app.state.paginationEventsInitialized = true;
      }
    } catch (error) {
      console.error('Error loading runs:', error);
      runsTable.innerHTML = '<tr><td colspan="6" class="text-center py-4">Error loading runs</td></tr>';
      paginationContainer.classList.add('d-none');
    }
  },

  /**
   * Load and display run details including steps
   * @param {string} runId - Run ID
   * @param {boolean} isAutoRefresh - Whether this is an auto-refresh call
   */
  async loadRunDetails(runId, isAutoRefresh = false) {
    const stepsTable = document.getElementById('steps-table').querySelector('tbody');

    try {
      // Only save expanded state if this is an auto-refresh
      if (isAutoRefresh) {
        const expandedRows = new Set();
        document.querySelectorAll('.details-row').forEach((row) => {
          if (row.style.display !== 'none') {
            expandedRows.add(row.id);
          }
        });
        app.state.expandedRows = expandedRows;
      }

      // Update page title if not an auto-refresh
      if (!isAutoRefresh) {
        document.getElementById('page-title').textContent = `Run Details: ${runId}`;
      }

      // Load Gantt chart
      charts.loadGanttChart(runId);

      // Fetch steps data
      const steps = await api.loadRunDetails(runId);

      // Update steps count
      const stepsCount = steps ? steps.length : 0;
      document.getElementById('steps-count').textContent = `Total Steps: ${stepsCount}`;

      // Store the steps in app state for filtering
      app.state.currentRunSteps = steps;

      // Only set up filter event listeners once
      if (!isAutoRefresh) {
        this.setupStepFilters();

        // Update the custom columns dropdown
        app.updatePresetColumnsDropdown();

        // Set up custom column event listeners
        this.setupCustomColumnListeners();
      }

      // Apply any current filters
      this.applyStepFilters();
    } catch (error) {
      console.error('Error loading run details:', error);
      stepsTable.innerHTML = '<tr><td colspan="5" class="text-center py-4">Error loading run details</td></tr>';
    }
  },

  /**
   * Set up event listeners for step filters
   */
  setupStepFilters() {
    const searchInput = document.getElementById('step-filter-search');
    const statusFilter = document.getElementById('step-filter-status');
    const resetButton = document.getElementById('step-filter-reset');

    // Save filter state in app state
    if (!app.state.stepFilters) {
      app.state.stepFilters = {
        search: '',
        status: '',
      };
    }

    // Set initial values from state
    searchInput.value = app.state.stepFilters.search;
    statusFilter.value = app.state.stepFilters.status;

    // Set up event listeners for filters
    searchInput.addEventListener('input', () => {
      app.state.stepFilters.search = searchInput.value;
      this.applyStepFilters();
    });

    statusFilter.addEventListener('change', () => {
      app.state.stepFilters.status = statusFilter.value;
      this.applyStepFilters();
    });

    // Reset filters
    resetButton.addEventListener('click', () => {
      searchInput.value = '';
      statusFilter.value = '';

      app.state.stepFilters = {
        search: '',
        status: '',
      };

      this.applyStepFilters();
    });
  },

  /**
   * Set up event listeners for custom columns
   */
  setupCustomColumnListeners() {
    // Setup event delegation for removing custom columns
    const activeColumnsContainer = document.getElementById('active-custom-columns');

    activeColumnsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-column') || e.target.closest('.remove-column')) {
        const columnName = e.target.closest('.custom-column-badge').getAttribute('data-column-name');

        // Remove from active columns
        app.state.activeColumns = app.state.activeColumns.filter((c) => c.name !== columnName);

        // Update UI
        this.updateCustomColumns();

        // Update the dropdown to show this column again
        app.updatePresetColumnsDropdown();
      }
    });

    // Initial update of custom columns
    this.updateCustomColumns();
  },

  /**
   * Update the custom columns in the steps table
   */
  updateCustomColumns() {
    // Update the active columns display
    const activeColumnsContainer = document.getElementById('active-custom-columns');
    activeColumnsContainer.innerHTML = '';

    app.state.activeColumns.forEach((column) => {
      const badge = document.createElement('div');
      badge.className = 'badge bg-light text-dark custom-column-badge';
      badge.setAttribute('data-column-name', column.name);
      badge.innerHTML = `
        ${column.name}
        <button type="button" class="btn-close btn-close-sm remove-column" aria-label="Remove"></button>
      `;
      activeColumnsContainer.appendChild(badge);
    });

    // Update the table header
    const tableHeader = document.getElementById('steps-table-header');

    // Remove any existing custom columns
    tableHeader.querySelectorAll('.custom-column').forEach((th) => th.remove());

    // Add custom columns before the last empty column
    const lastColumn = tableHeader.lastElementChild;

    app.state.activeColumns.forEach((column) => {
      const th = document.createElement('th');
      th.className = 'custom-column';
      th.textContent = column.name;
      tableHeader.insertBefore(th, lastColumn);
    });

    // Update the colspan of any "no data" rows
    const noDataRows = document.querySelectorAll('#steps-table tbody tr:not(.details-row)');
    noDataRows.forEach((row) => {
      const firstCell = row.querySelector('td[colspan]');
      if (firstCell) {
        // Base column count is now 5 instead of 7
        const baseColumnCount = 5;
        firstCell.setAttribute('colspan', baseColumnCount + app.state.activeColumns.length);
      }
    });

    // Reapply filters to update the table with the new columns
    this.applyStepFilters();
  },

  /**
   * Safely escape a string for use in HTML attributes
   * @param {string} str - The string to escape
   * @returns {string} - The escaped string
   */
  escapeHtml(str) {
    if (typeof str !== 'string') {
      return str;
    }
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Extract nested data from an object using dot notation
   * @param {Object} obj - The object to extract data from
   * @param {string} path - The path to the data using dot notation
   * @returns {*} - The extracted data or "N/A" if not found
   */
  getNestedData(obj, path) {
    // Debug logging
    console.log('Extracting data:', {
      objectType: obj ? (Array.isArray(obj) ? 'Array' : typeof obj) : 'null/undefined',
      path,
      objectPreview: obj ? JSON.stringify(obj).substring(0, 100) + '...' : 'null',
    });

    if (!obj || !path) {
      return 'N/A';
    }

    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      console.log(
        `Accessing key: "${key}", current result type:`,
        result ? (Array.isArray(result) ? 'Array' : typeof result) : 'null/undefined',
      );

      if (result === null || result === undefined || typeof result !== 'object') {
        console.log(`Failed at key "${key}": result is not an object`);
        return 'N/A';
      }

      result = result[key];

      if (result === undefined) {
        console.log(`Failed at key "${key}": property not found`);
        return 'N/A';
      }
    }

    // Debug the final result
    console.log('Final result:', result);

    // Format the result based on its type
    if (result === null) {
      return 'null';
    } else if (typeof result === 'object') {
      try {
        return JSON.stringify(result);
      } catch (e) {
        return 'Object';
      }
    } else {
      return result.toString();
    }
  },

  /**
   * Apply filters to the steps list
   */
  applyStepFilters() {
    const stepsTable = document.getElementById('steps-table').querySelector('tbody');
    const steps = app.state.currentRunSteps;

    if (!steps || !Array.isArray(steps)) {
      return;
    }

    // Clear the table first
    stepsTable.innerHTML = '';

    // Get filter values
    const search = app.state.stepFilters.search.toLowerCase();
    const status = app.state.stepFilters.status;

    // Filter steps
    const filteredSteps = steps.filter((step) => {
      // Search filter
      if (search && !step.key.toLowerCase().includes(search) && !step.name.toLowerCase().includes(search)) {
        return false;
      }

      // Status filter
      if (status) {
        const stepStatus = step.error ? 'error' : !step.time.endTs || step.time.endTs === 0 ? 'running' : 'completed';
        if (stepStatus !== status) {
          return false;
        }
      }

      return true;
    });

    // Update filtered count
    document.getElementById('steps-count').textContent =
      `Total Steps: ${filteredSteps.length}${filteredSteps.length !== steps.length ? ` (filtered from ${steps.length})` : ''}`;

    // Show filtered steps or empty message
    if (filteredSteps.length === 0) {
      const columnsCount = 5 + app.state.activeColumns.length; // Base columns + custom columns
      stepsTable.innerHTML = `<tr><td colspan="${columnsCount}" class="text-center py-4">No steps match the current filters</td></tr>`;
      return;
    }

    // Render filtered steps
    filteredSteps.forEach((step, index) => {
      const duration = utils.formatDuration(step.time.timeUsageMs);

      let status = 'Completed';
      let statusClass = 'status-success';

      if (step.error) {
        status = 'Error';
        statusClass = 'status-error';
      } else if (!step.time.endTs || step.time.endTs === 0) {
        status = 'Running';
        statusClass = 'status-running';
      }

      // Create unique IDs for each row and details section
      const rowId = `step-row-${index}`;
      const detailsId = `step-details-${index}`;

      // Main row
      const row = document.createElement('tr');
      row.id = rowId;
      row.setAttribute('data-target', detailsId);
      row.innerHTML = `
        <td>${step.key}</td>
        <td><a href="#" class="step-name-link">${step.name}</a></td>
        <td>${duration}</td>
        <td class="${statusClass}">${status}</td>
      `;

      // Add custom columns
      app.state.activeColumns.forEach((column) => {
        const cell = document.createElement('td');

        // Extract data using the path
        let dataObj, dataPath;

        if (column.path.startsWith('result.')) {
          dataObj = step.result;
          dataPath = column.path.substring(7); // Remove "result." prefix
        } else if (column.path.startsWith('records.')) {
          dataObj = step.records;
          dataPath = column.path.substring(8); // Remove "records." prefix
        } else {
          dataObj = step;
          dataPath = column.path;
        }

        const data = this.getNestedData(dataObj, dataPath);

        // Format data based on type for better display
        let displayData = data;
        let fullData = data; // For tooltip/title

        // Special handling for timestamp columns
        if (column.isTimestamp) {
          if (data !== 'N/A' && data !== null && data !== undefined) {
            // Make sure we have a valid timestamp
            const timestamp = Number(data);
            console.log(`Processing timestamp for column ${column.name}:`, {
              originalData: data,
              convertedToNumber: timestamp,
              isValid: !isNaN(timestamp) && timestamp > 0,
            });

            if (!isNaN(timestamp) && timestamp > 0) {
              displayData = utils.formatDateTime(timestamp);
              fullData = displayData;
            } else {
              displayData = 'N/A';
              fullData = 'N/A';
            }
          } else {
            displayData = 'N/A';
            fullData = 'N/A';
          }
        }
        // Add special styling for different data types
        else if (data === 'N/A') {
          cell.classList.add('text-muted');
        } else if (typeof data === 'number' || !isNaN(Number(data))) {
          cell.classList.add('text-end');
          // Format number with commas for readability if it's large
          if (Number(data) >= 10000) {
            displayData = Number(data).toLocaleString();
          }
        } else if (data.length > 150) {
          // For very long text, show a condensed version
          displayData = data.substring(0, 147) + '...';
        }

        // Safely escape the data for HTML display
        const safeDisplayData = this.escapeHtml(displayData);
        const safeFullData = this.escapeHtml(fullData);

        cell.innerHTML = `<span title="${safeFullData}">${safeDisplayData}</span>`;

        row.appendChild(cell);
      });

      // Add actions column
      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-end';
      actionsCell.innerHTML = `
        <i class="fas fa-sitemap search-children-icon me-2" title="Show child steps" data-key="${step.key}"></i>
        <i class="fas fa-chevron-down expand-icon"></i>
      `;
      row.appendChild(actionsCell);

      stepsTable.appendChild(row);

      // Details row
      const detailsRow = document.createElement('tr');
      detailsRow.id = detailsId;
      detailsRow.className = 'details-row';

      // Check if this row was expanded before refresh
      const wasExpanded = app.state.expandedRows.has(detailsId);
      detailsRow.style.display = wasExpanded ? 'table-row' : 'none';

      // Update expand icon based on expanded state
      if (wasExpanded) {
        row.querySelector('.expand-icon').classList.remove('fa-chevron-down');
        row.querySelector('.expand-icon').classList.add('fa-chevron-up');
      }

      // Create the details cell
      const detailsCell = document.createElement('td');
      detailsCell.colSpan = 5 + app.state.activeColumns.length; // Base columns + custom columns

      let detailsContent = '<div class="step-details">';

      // Records section
      const recordsJson = JSON.stringify(step.records || {}, null, 2);
      detailsContent += `
        <div class="detail-section">
          <div class="detail-header">
            <h4>Records:</h4>
            <div class="detail-actions">
              <button class="view-btn" data-content="${encodeURIComponent(recordsJson)}">
                <i class="fa fa-expand"></i>
              </button>
              <button class="copy-btn" data-content="${encodeURIComponent(recordsJson)}">
                <i class="fa fa-copy"></i>
              </button>
            </div>
          </div>
          <div class="detail-content">
            <textarea readonly rows="10">${recordsJson}</textarea>
          </div>
        </div>
      `;

      // Result section (if available)
      if (step.result !== undefined) {
        const resultJson = JSON.stringify(step.result, null, 2);
        detailsContent += `
          <div class="detail-section">
            <div class="detail-header">
              <h4>Result:</h4>
              <div class="detail-actions">
                <button class="view-btn" data-content="${encodeURIComponent(resultJson)}">
                  <i class="fa fa-expand"></i>
                </button>
                <button class="copy-btn" data-content="${encodeURIComponent(resultJson)}">
                  <i class="fa fa-copy"></i>
                </button>
              </div>
            </div>
            <div class="detail-content">
              <textarea readonly rows="10">${resultJson}</textarea>
            </div>
          </div>
        `;
      }

      // Error section (if available)
      if (step.error) {
        detailsContent += `
          <div class="detail-section">
            <div class="detail-header">
              <h4>Error:</h4>
              <div class="detail-actions">
                <button class="view-btn" data-content="${encodeURIComponent(step.error)}">
                  <i class="fa fa-expand"></i>
                </button>
                <button class="copy-btn" data-content="${encodeURIComponent(step.error)}">
                  <i class="fa fa-copy"></i>
                </button>
              </div>
            </div>
            <div class="detail-content">
              <textarea readonly rows="10">${step.error}</textarea>
            </div>
          </div>
        `;
      }

      detailsContent += '</div>';
      detailsCell.innerHTML = detailsContent;
      detailsRow.appendChild(detailsCell);
      stepsTable.appendChild(detailsRow);

      // Add step name link functionality
      const stepNameLink = row.querySelector('.step-name-link');
      stepNameLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Get pipeline from URL
        const currentUrl = new URL(window.location);
        const pipeline = currentUrl.searchParams.get('pipeline');

        if (!pipeline) {
          console.error('No pipeline selected');
          return;
        }

        // Prepare URL for navigation to step stats view
        const url = new URL(window.location);
        url.searchParams.set('view', 'step-stats-view');
        url.searchParams.set('stepName', step.name);
        url.searchParams.delete('runId');
        url.searchParams.delete('stepKey');

        // Use pushState to navigate to the step stats view
        window.history.pushState({ view: 'step-stats-view', stepName: step.name }, '', url);

        // Show the step stats view
        this.showView('step-stats-view');
      });

      // Add event listeners for view buttons
      detailsRow.querySelectorAll('.view-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
          e.stopPropagation(); // Prevent row expansion when clicking view
          const content = decodeURIComponent(this.getAttribute('data-content'));
          const title = this.closest('.detail-section').querySelector('h4').textContent;

          // Calculate popup dimensions (80% of screen size)
          const width = Math.min(1200, Math.floor(window.innerWidth * 0.8));
          const height = Math.min(900, Math.floor(window.innerHeight * 0.8));

          // Calculate center position relative to the browser window
          const left = Math.floor(window.screenX + (window.innerWidth - width) / 2);
          const top = Math.floor(window.screenY + (window.innerHeight - height) / 2);

          // Open popup window with calculated dimensions and position
          const popup = window.open(
            '',
            '_blank',
            `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`,
          );

          popup.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${title}</title>
              <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
              <style>
                body {
                  margin: 0;
                  padding: 20px;
                  font-family: 'JetBrains Mono', monospace;
                  background: #f5f7fa;
                  height: 100vh;
                  box-sizing: border-box;
                }
                .container {
                  position: relative;
                  height: calc(100vh - 40px);
                }
                pre {
                  background: white;
                  padding: 20px;
                  border-radius: 4px;
                  border: 1px solid #dde2e7;
                  overflow: auto;
                  margin: 0;
                  font-size: 12px;
                  line-height: 1.5;
                  white-space: pre-wrap;
                  word-wrap: break-word;
                  height: 100%;
                  box-sizing: border-box;
                }
                .copy-btn {
                  position: absolute;
                  top: 10px;
                  right: 10px;
                  background: white;
                  border: 1px solid #dde2e7;
                  border-radius: 4px;
                  padding: 8px 12px;
                  font-size: 14px;
                  color: #2c6e9b;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  transition: all 0.2s ease;
                  z-index: 1;
                }
                .copy-btn:hover {
                  background: #f5f7fa;
                  border-color: #2c6e9b;
                }
                .copy-btn i {
                  font-size: 14px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <button class="copy-btn" onclick="copyContent()">
                  <i class="fa fa-copy"></i>
                  Copy
                </button>
                <pre>${content}</pre>
              </div>
              <script>
                function copyContent() {
                  const content = document.querySelector('pre').textContent;
                  navigator.clipboard.writeText(content).then(() => {
                    const btn = document.querySelector('.copy-btn');
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '<i class="fa fa-check"></i> Copied!';
                    setTimeout(() => {
                      btn.innerHTML = originalHtml;
                    }, 2000);
                  }).catch(err => {
                    console.error('Failed to copy text:', err);
                  });
                }
              </script>
            </body>
            </html>
          `);
          popup.document.close();
        });
      });

      // Add event listeners for copy buttons
      detailsRow.querySelectorAll('.copy-btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
          e.stopPropagation(); // Prevent row expansion when clicking copy
          const content = decodeURIComponent(this.getAttribute('data-content'));
          navigator.clipboard
            .writeText(content)
            .then(() => {
              // Show temporary success message
              const originalText = this.innerHTML;
              this.innerHTML = '<i class="fa fa-check"></i>';

              // Restore original icon after 2 seconds
              setTimeout(() => {
                this.innerHTML = originalText;
              }, 2000);
            })
            .catch((err) => {
              console.error('Failed to copy text: ', err);
            });
        });
      });
    });

    // Make rows clickable to expand/collapse
    document.querySelectorAll('#steps-table tbody tr:not(.details-row)').forEach((row) => {
      // Add click handler for search children icon
      const searchIcon = row.querySelector('.search-children-icon');
      if (searchIcon) {
        searchIcon.addEventListener('click', function (e) {
          e.stopPropagation(); // Prevent row click from triggering

          const stepKey = this.getAttribute('data-key');
          const searchBox = document.getElementById('step-filter-search');

          if (searchBox) {
            console.log('Setting search value to:', stepKey);
            searchBox.value = stepKey;
            searchBox.dispatchEvent(new Event('input', { bubbles: true }));
            searchBox.dispatchEvent(new Event('change', { bubbles: true }));

            // Also try to submit the form if it exists
            const searchForm = searchBox.closest('form');
            if (searchForm) {
              searchForm.dispatchEvent(new Event('submit', { bubbles: true }));
            }
          } else {
            console.error('Search box not found with ID "step-filter-search"');
          }
        });
      }

      row.addEventListener('click', function (e) {
        // Don't trigger if clicking on the step name link
        if (e.target.closest('.step-name-link')) {
          return;
        }

        const targetId = this.getAttribute('data-target');
        const detailsRow = document.getElementById(targetId);
        const isExpanded = detailsRow.style.display !== 'none';
        const expandIcon = this.querySelector('.expand-icon');

        // Update expanded state in the app state object (keeping UI interaction state in memory)
        if (isExpanded) {
          app.state.expandedRows.delete(targetId);
          expandIcon.classList.remove('fa-chevron-up');
          expandIcon.classList.add('fa-chevron-down');
        } else {
          app.state.expandedRows.add(targetId);
          expandIcon.classList.remove('fa-chevron-down');
          expandIcon.classList.add('fa-chevron-up');
        }

        detailsRow.style.display = isExpanded ? 'none' : 'table-row';
      });
    });
  },

  /**
   * Load step names for a pipeline
   * @param {string} pipeline - Pipeline name
   * @returns {Promise<Array>} Array of step names
   */
  async loadStepNames(pipeline) {
    const stepNameSelect = document.getElementById('step-name-select');

    try {
      const steps = await api.loadStepNames(pipeline);

      stepNameSelect.innerHTML = '<option value="">Select a step</option>';

      steps.forEach((step) => {
        stepNameSelect.innerHTML += `<option value="${step}">${step}</option>`;
      });

      // Get selected step from URL parameters
      const params = new URLSearchParams(window.location.search);
      const selectedStepName = params.get('stepName');

      // If a step is selected in the URL, set the dropdown value
      if (selectedStepName && steps.includes(selectedStepName)) {
        stepNameSelect.value = selectedStepName;
      }

      return steps; // Return the steps for promise chaining
    } catch (error) {
      console.error('Error loading step names:', error);
      stepNameSelect.innerHTML = '<option value="">Error loading steps</option>';
      return []; // Return empty array in case of error
    }
  },

  /**
   * Load and display step time series data
   * @param {string} pipeline - Pipeline name
   * @param {string} stepName - Step name
   */
  async loadStepTimeSeries(pipeline, stepName) {
    const stepStatsTable = document.getElementById('step-stats-table').querySelector('tbody');
    const stepStatsSummary = document.getElementById('step-stats-summary');
    const chartContainer = document.getElementById('step-time-series-chart-container');
    const paginationContainer = document.getElementById('steps-pagination');
    // const paginationRange = document.getElementById('steps-pagination-range');
    const prevButton = document.getElementById('steps-pagination-prev');
    const nextButton = document.getElementById('steps-pagination-next');
    const pageSizeSelect = document.getElementById('steps-pagination-page-size');

    // Keep step title hidden regardless of step selection
    const stepStatsTitle = document.getElementById('step-stats-title');
    stepStatsTitle.classList.add('d-none');

    // Early return with message if no step name is provided
    if (!stepName) {
      stepStatsSummary.classList.add('d-none');
      chartContainer.classList.add('d-none');
      paginationContainer.classList.add('d-none');
      stepStatsTable.innerHTML =
        '<tr><td colspan="5" class="text-center py-4">Select a step to view statistics</td></tr>';
      return;
    }

    try {
      // Show loading state immediately
      stepStatsTable.innerHTML =
        '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2" role="status"><span class="visually-hidden">Loading...</span></div> Loading step statistics...</td></tr>';
      stepStatsSummary.classList.add('d-none');
      chartContainer.classList.add('d-none');
      paginationContainer.classList.add('d-none');

      // Get date range from URL parameters or fallback to app state
      const params = new URLSearchParams(window.location.search);
      const timePreset = params.get('timePreset') || app.state.globalDateRange.timePreset;
      const startDate = params.get('startDate') || app.state.globalDateRange.startDate;
      const endDate = params.get('endDate') || app.state.globalDateRange.endDate;

      const dateRange = {
        timePreset,
        startDate,
        endDate,
      };

      // Initialize pagination state if it doesn't exist
      if (!app.state.stepsPagination) {
        app.state.stepsPagination = {
          page: 1,
          pageSize: 10,
        };
      }

      // Reset any expanded rows when changing steps
      app.state.stepsExpandedRows = new Set();

      // Use existing pageSize from app.state.stepsPagination
      // Removed reference to pageSizeSelect to fix the ReferenceError

      // Fetch time series data for the step with pagination
      const data = await api.loadStepTimeSeries(pipeline, stepName, dateRange, app.state.stepsPagination);

      // Update app state with the pagination info from the response
      if (data.pagination) {
        app.state.stepsPagination = {
          page: data.pagination.page,
          pageSize: data.pagination.pageSize,
          totalItems: data.pagination.totalItems,
          totalPages: data.pagination.totalPages,
        };
      }

      // Check if we have the response format with stats
      const hasStats = data && data.stats;
      const instances = data.timeSeries || [];

      if (!instances || !instances.length) {
        stepStatsTable.innerHTML =
          '<tr><td colspan="5" class="text-center py-4">No instances found for this step</td></tr>';
        stepStatsSummary.classList.add('d-none');
        chartContainer.classList.add('d-none');
        paginationContainer.classList.add('d-none');
        return;
      }

      // Show chart container since we have data
      chartContainer.classList.remove('d-none');

      // Display statistics if available
      if (hasStats) {
        // Update statistics display
        document.getElementById('stats-total-executions').textContent = data.stats.totalExecutions;
        document.getElementById('stats-success-count').textContent = data.stats.successCount;
        document.getElementById('stats-error-count').textContent = data.stats.errorCount;
        document.getElementById('stats-avg-duration').textContent = utils.formatDuration(data.stats.avgDuration, true);
        document.getElementById('stats-min-duration').textContent = utils.formatDuration(data.stats.minDuration, true);
        document.getElementById('stats-max-duration').textContent = utils.formatDuration(data.stats.maxDuration, true);

        // Show the stats summary section
        stepStatsSummary.classList.remove('d-none');
      } else {
        // Hide stats if not available
        stepStatsSummary.classList.add('d-none');
      }

      // Process data for chart
      const chartData = utils.processTimeSeriesDataForChart(instances, dateRange);

      // Draw the chart
      charts.drawStepTimeSeriesChart(chartData);

      // Show pagination container
      if (data.pagination) {
        paginationContainer.classList.remove('d-none');

        // Update pagination info - using document.getElementById directly to avoid reference error
        const start = (data.pagination.page - 1) * data.pagination.pageSize + 1;
        const end = Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalItems);
        document.getElementById('steps-pagination-range').textContent =
          `Showing ${start}-${end} of ${data.pagination.totalItems} instances`;

        // Enable/disable pagination buttons
        prevButton.disabled = data.pagination.page <= 1;
        nextButton.disabled = data.pagination.page >= data.pagination.totalPages;

        // Set the page size select value
        pageSizeSelect.value = data.pagination.pageSize.toString();
      } else {
        paginationContainer.classList.add('d-none');
      }

      // Populate the table with instances
      stepStatsTable.innerHTML = '';

      instances.forEach((instance, index) => {
        const timestamp = utils.formatDateTime(instance.timestamp);
        const duration = utils.formatDuration(instance.duration);

        // Create unique IDs for each row and details section
        const rowId = `step-stat-row-${index}`;
        const detailsId = `step-stat-details-${index}`;

        // Main row
        const row = document.createElement('tr');
        row.id = rowId;
        row.setAttribute('data-target', detailsId);
        row.innerHTML = `
          <td>${timestamp}</td>
          <td><a href="#" class="run-id-link">${instance.runId}</a></td>
          <td>${instance.stepKey}</td>
          <td>${duration}</td>
        `;

        // Log the instance structure to debug
        console.log('Step stats instance structure:', {
          index,
          runId: instance.runId,
          stepKey: instance.stepKey,
          duration: instance.duration,
          fullInstance: instance,
        });

        // Add custom columns
        app.state.stepStatsActiveColumns.forEach((column) => {
          const cell = document.createElement('td');

          // Extract data using the path - try to get from instance first
          let dataObj, dataPath;

          if (column.path.startsWith('result.')) {
            dataObj = instance.result;
            dataPath = column.path.substring(7); // Remove "result." prefix
          } else if (column.path.startsWith('records.')) {
            dataObj = instance.records;
            dataPath = column.path.substring(8); // Remove "records." prefix
          } else if (column.path.startsWith('time.')) {
            dataObj = instance.time || {
              startTs: instance.timestamp,
              endTs: instance.timestamp + instance.duration,
              timeUsageMs: instance.duration,
            };
            dataPath = column.path.substring(5); // Remove "time." prefix
          } else {
            dataObj = instance;
            dataPath = column.path;
          }

          console.log(`Extracting path ${column.path} for instance ${index}:`, {
            columnName: column.name,
            dataObj,
            dataPath,
          });

          const data = this.getNestedData(dataObj, dataPath);

          // Format data based on type for better display
          let displayData = data;
          let fullData = data; // For tooltip/title

          // Special handling for timestamp columns
          if (column.isTimestamp) {
            if (data !== 'N/A' && data !== null && data !== undefined) {
              // Make sure we have a valid timestamp
              const timestamp = Number(data);
              console.log(`Processing timestamp for column ${column.name}:`, {
                originalData: data,
                convertedToNumber: timestamp,
                isValid: !isNaN(timestamp) && timestamp > 0,
              });

              if (!isNaN(timestamp) && timestamp > 0) {
                displayData = utils.formatDateTime(timestamp);
                fullData = displayData;
              } else {
                displayData = 'N/A';
                fullData = 'N/A';
              }
            } else {
              displayData = 'N/A';
              fullData = 'N/A';
            }
          }
          // Add special styling for different data types
          else if (data === 'N/A') {
            cell.classList.add('text-muted');
          } else if (typeof data === 'number' || !isNaN(Number(data))) {
            cell.classList.add('text-end');
            // Format number with commas for readability if it's large
            if (Number(data) >= 10000) {
              displayData = Number(data).toLocaleString();
            }
          } else if (data && data.length > 150) {
            // For very long text, show a condensed version
            displayData = data.substring(0, 147) + '...';
          }

          // Safely escape the data for HTML display
          const safeDisplayData = this.escapeHtml(displayData);
          const safeFullData = this.escapeHtml(fullData);

          cell.innerHTML = `<span title="${safeFullData}">${safeDisplayData}</span>`;

          row.appendChild(cell);
        });

        // Add actions column
        const actionsCell = document.createElement('td');
        actionsCell.className = 'text-end';
        actionsCell.innerHTML = `
          <i class="fas fa-chevron-down expand-icon"></i>
        `;
        row.appendChild(actionsCell);

        stepStatsTable.appendChild(row);

        // Add click event listener to the Run ID link
        const runIdLink = row.querySelector('.run-id-link');
        runIdLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showRunDetails(instance.runId);
        });

        // Details row
        const detailsRow = document.createElement('tr');
        detailsRow.id = detailsId;
        detailsRow.className = 'details-row';
        detailsRow.style.display = 'none';

        // Create the details cell
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 5 + app.state.stepStatsActiveColumns.length;

        // Fetch step details for this instance
        api
          .loadRunDetails(instance.runId)
          .then((steps) => {
            // Find the matching step
            const step = steps.find((s) => s.key === instance.stepKey);

            if (step) {
              // Store the step details in the instance for potential later use by custom columns
              instance.stepDetails = step;
              instance.records = step.records;
              instance.result = step.result;
              instance.time = step.time;
              instance.error = step.error;

              // Now that we have detailed data, refresh any custom columns that show N/A
              app.state.stepStatsActiveColumns.forEach((column) => {
                // Find the corresponding cell in the row
                const cells = row.querySelectorAll('td');
                const columnIndex = 4 + app.state.stepStatsActiveColumns.indexOf(column); // Base index (4) + column position

                if (columnIndex >= 4 && columnIndex < cells.length && cells[columnIndex].textContent.trim() === 'N/A') {
                  // Try to extract data again with complete data
                  let dataObj, dataPath;

                  if (column.path.startsWith('result.')) {
                    dataObj = step.result;
                    dataPath = column.path.substring(7);
                  } else if (column.path.startsWith('records.')) {
                    dataObj = step.records;
                    dataPath = column.path.substring(8);
                  } else if (column.path.startsWith('time.')) {
                    dataObj = step.time;
                    dataPath = column.path.substring(5);
                  } else {
                    dataObj = step;
                    dataPath = column.path;
                  }

                  const data = ui.getNestedData(dataObj, dataPath);

                  // Format and update only if we got actual data
                  if (data !== 'N/A') {
                    let displayData = data;
                    let fullData = data;

                    // Special handling for timestamp columns
                    if (column.isTimestamp && !isNaN(Number(data)) && Number(data) > 0) {
                      displayData = utils.formatDateTime(Number(data));
                      fullData = displayData;
                    } else if (typeof data === 'number' || !isNaN(Number(data))) {
                      // Format number with commas for readability if it's large
                      if (Number(data) >= 10000) {
                        displayData = Number(data).toLocaleString();
                      }
                    }

                    // Safely escape the data for HTML display
                    const safeDisplayData = ui.escapeHtml(displayData);
                    const safeFullData = ui.escapeHtml(fullData);

                    // Update the cell content
                    cells[columnIndex].innerHTML = `<span title="${safeFullData}">${safeDisplayData}</span>`;

                    // Add appropriate styling
                    if (typeof data === 'number' || !isNaN(Number(data))) {
                      cells[columnIndex].classList.add('text-end');
                    }
                  }
                }
              });

              let detailsContent = '<div class="step-details">';

              // Records section
              const recordsJson = JSON.stringify(step.records || {}, null, 2);
              detailsContent += `
                <div class="detail-section">
                  <div class="detail-header">
                    <h4>Records:</h4>
                    <div class="detail-actions">
                      <button class="view-btn" data-content="${encodeURIComponent(recordsJson)}">
                        <i class="fa fa-expand"></i>
                      </button>
                      <button class="copy-btn" data-content="${encodeURIComponent(recordsJson)}">
                        <i class="fa fa-copy"></i>
                      </button>
                    </div>
                  </div>
                  <div class="detail-content">
                    <textarea readonly rows="10">${recordsJson}</textarea>
                  </div>
                </div>
              `;

              // Result section (if available)
              if (step.result !== undefined) {
                const resultJson = JSON.stringify(step.result, null, 2);
                detailsContent += `
                  <div class="detail-section">
                    <div class="detail-header">
                      <h4>Result:</h4>
                      <div class="detail-actions">
                        <button class="view-btn" data-content="${encodeURIComponent(resultJson)}">
                          <i class="fa fa-expand"></i>
                        </button>
                        <button class="copy-btn" data-content="${encodeURIComponent(resultJson)}">
                          <i class="fa fa-copy"></i>
                        </button>
                      </div>
                    </div>
                    <div class="detail-content">
                      <textarea readonly rows="10">${resultJson}</textarea>
                    </div>
                  </div>
                `;
              }

              // Error section (if available)
              if (step.error) {
                detailsContent += `
                  <div class="detail-section">
                    <div class="detail-header">
                      <h4>Error:</h4>
                      <div class="detail-actions">
                        <button class="view-btn" data-content="${encodeURIComponent(step.error)}">
                          <i class="fa fa-expand"></i>
                        </button>
                        <button class="copy-btn" data-content="${encodeURIComponent(step.error)}">
                          <i class="fa fa-copy"></i>
                        </button>
                      </div>
                    </div>
                    <div class="detail-content">
                      <textarea readonly rows="10">${step.error}</textarea>
                    </div>
                  </div>
                `;
              }

              detailsContent += '</div>';
              detailsCell.innerHTML = detailsContent;

              // Add click handlers for copy/view buttons
              detailsCell.querySelectorAll('.copy-btn').forEach((btn) => {
                btn.addEventListener('click', function (e) {
                  e.stopPropagation();
                  const content = decodeURIComponent(this.getAttribute('data-content'));
                  navigator.clipboard.writeText(content);

                  // Show a temporary "Copied!" tooltip
                  this.setAttribute('title', 'Copied!');
                  setTimeout(() => {
                    this.removeAttribute('title');
                  }, 2000);
                });
              });

              detailsCell.querySelectorAll('.view-btn').forEach((btn) => {
                btn.addEventListener('click', function (e) {
                  e.stopPropagation();
                  const content = decodeURIComponent(this.getAttribute('data-content'));

                  // Open in a modal or new tab
                  const modal = new bootstrap.Modal(document.getElementById('content-view-modal'));
                  document.getElementById('content-view-modal-body').innerHTML = `<pre>${content}</pre>`;
                  modal.show();
                });
              });
            } else {
              detailsCell.innerHTML = `<div class="p-3 text-center">Step details not found for ${instance.stepKey}</div>`;
            }
          })
          .catch((error) => {
            console.error('Error loading step details:', error);
            detailsCell.innerHTML = `<div class="p-3 text-center">Error loading step details: ${error.message}</div>`;
          });

        detailsRow.appendChild(detailsCell);
        stepStatsTable.appendChild(detailsRow);

        // Add click event to toggle details visibility
        row.addEventListener('click', () => {
          // Toggle details visibility
          const isVisible = detailsRow.style.display !== 'none';
          detailsRow.style.display = isVisible ? 'none' : 'table-row';

          // Update icon
          const icon = row.querySelector('.expand-icon');
          icon.classList.toggle('fa-chevron-down', isVisible);
          icon.classList.toggle('fa-chevron-up', !isVisible);

          // Track expanded state in app state
          if (isVisible) {
            app.state.stepsExpandedRows.delete(detailsId);
          } else {
            app.state.stepsExpandedRows.add(detailsId);
          }
        });
      });

      // Setup pagination controls
      paginationContainer.classList.remove('d-none');

      prevButton.onclick = function () {
        // Save current scroll position
        const scrollPosition = window.scrollY;

        app.state.stepsPagination.page--;
        ui.loadStepTimeSeries(pipeline, stepName).then(() => {
          // Restore scroll position after data loads
          window.scrollTo(0, scrollPosition);
        });
      };

      nextButton.onclick = function () {
        // Save current scroll position
        const scrollPosition = window.scrollY;

        app.state.stepsPagination.page++;
        ui.loadStepTimeSeries(pipeline, stepName).then(() => {
          // Restore scroll position after data loads
          window.scrollTo(0, scrollPosition);
        });
      };

      pageSizeSelect.value = app.state.stepsPagination.pageSize;
      pageSizeSelect.onchange = function () {
        // When changing page size, we want to go back to the top
        app.state.stepsPagination.pageSize = parseInt(pageSizeSelect.value, 10);
        app.state.stepsPagination.page = 1; // Reset to page 1 when changing page size
        ui.loadStepTimeSeries(pipeline, stepName);
      };
    } catch (error) {
      console.error('Error loading step time series:', error);
      stepStatsTable.innerHTML = '<tr><td colspan="5" class="text-center py-4">Error loading step statistics</td></tr>';
      stepStatsSummary.classList.add('d-none');
      chartContainer.classList.add('d-none');
      paginationContainer.classList.add('d-none');
    }
  },

  /**
   * Initialize date pickers with flatpickr
   */
  initDatePickers() {
    // Check if Flatpickr is loaded
    if (typeof flatpickr === 'function') {
      console.log('Flatpickr is loaded correctly');

      // Flag to track if changes are programmatic
      let isProgrammaticChange = false;

      // Get date values from URL or use defaults
      const params = new URLSearchParams(window.location.search);
      const startDate = params.get('startDate')
        ? new Date(params.get('startDate'))
        : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = params.get('endDate') ? new Date(params.get('endDate')) : new Date();

      // Initialize global date pickers with Flatpickr
      const globalStartDatePicker = flatpickr('#global-start-date', {
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        time_24hr: true,
        defaultDate: startDate,
        onChange: function (selectedDates, dateStr) {
          // Only change to Custom if the user manually selected a date
          if (!isProgrammaticChange && dateStr !== '') {
            document.getElementById('global-time-preset-select').value = 'custom';

            // Update URL
            const url = new URL(window.location);
            url.searchParams.set('timePreset', 'custom');
            url.searchParams.set('startDate', dateStr);
            window.history.replaceState({}, '', url);
          }
        },
      });

      const globalEndDatePicker = flatpickr('#global-end-date', {
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        time_24hr: true,
        defaultDate: endDate,
        onChange: function (selectedDates, dateStr) {
          // Only change to Custom if the user manually selected a date
          if (!isProgrammaticChange && dateStr !== '') {
            document.getElementById('global-time-preset-select').value = 'custom';

            // Update URL
            const url = new URL(window.location);
            url.searchParams.set('timePreset', 'custom');
            url.searchParams.set('endDate', dateStr);
            window.history.replaceState({}, '', url);
          }
        },
      });

      console.log('Date pickers initialized:', globalStartDatePicker, globalEndDatePicker);

      // Get preset from URL or use default
      const timePreset = params.get('timePreset') || '1440';
      document.getElementById('global-time-preset-select').value = timePreset;

      // Trigger the change event to set up the initial state
      const event = new Event('change');
      document.getElementById('global-time-preset-select').dispatchEvent(event);
    } else {
      console.error('Flatpickr is not loaded!');
    }
  },

  /**
   * Initialize time range preset dropdown
   */
  initTimePresets() {
    const presetSelect = document.getElementById('global-time-preset-select');

    // Get preset from URL or use default
    const params = new URLSearchParams(window.location.search);
    const timePreset = params.get('timePreset') || '1440'; // Default to 24 hours

    // Set value to the one from URL or default
    presetSelect.value = timePreset;

    // Trigger the change event to set up the initial state
    const event = new Event('change');
    presetSelect.dispatchEvent(event);

    // Add event listener for global time preset dropdown
    presetSelect.addEventListener('change', function () {
      // Skip if "Custom" is selected
      if (this.value === 'custom') {
        return;
      }

      // For preset selections, clear both date pickers visually
      document.getElementById('global-start-date').value = '';
      document.getElementById('global-end-date').value = '';

      // Store the preset value in URL parameters and state
      const url = new URL(window.location);
      url.searchParams.set('timePreset', this.value);
      url.searchParams.delete('startDate');
      url.searchParams.delete('endDate');

      // Save in app state as fallback
      app.state.globalDateRange.timePreset = this.value;
      app.state.globalDateRange.startDate = null;
      app.state.globalDateRange.endDate = null;

      // Update URL without navigation
      window.history.replaceState({}, '', url);
    });
  },

  /**
   * Update the custom columns in the step stats table
   */
  updateStepStatsCustomColumns() {
    // Update the active columns display
    const activeColumnsContainer = document.getElementById('step-stats-active-custom-columns');
    activeColumnsContainer.innerHTML = '';

    app.state.stepStatsActiveColumns.forEach((column) => {
      const badge = document.createElement('div');
      badge.className = 'badge bg-light text-dark custom-column-badge';
      badge.setAttribute('data-column-name', column.name);
      badge.innerHTML = `
        ${column.name}
        <button type="button" class="btn-close btn-close-sm remove-column" aria-label="Remove"></button>
      `;
      activeColumnsContainer.appendChild(badge);
    });

    // Update the table header
    const tableHeader = document.getElementById('step-stats-table-header');

    // Remove any existing custom columns
    tableHeader.querySelectorAll('.custom-column').forEach((th) => th.remove());

    // Add custom columns before the last empty column
    const lastColumn = tableHeader.lastElementChild;

    app.state.stepStatsActiveColumns.forEach((column) => {
      const th = document.createElement('th');
      th.className = 'custom-column';
      th.textContent = column.name;
      tableHeader.insertBefore(th, lastColumn);
    });

    // Update the colspan of any "no data" rows
    const noDataRows = document.querySelectorAll('#step-stats-table tbody tr:not(.details-row)');
    noDataRows.forEach((row) => {
      const firstCell = row.querySelector('td[colspan]');
      if (firstCell) {
        // Base column count is 5
        const baseColumnCount = 5;
        firstCell.setAttribute('colspan', baseColumnCount + app.state.stepStatsActiveColumns.length);
      }
    });

    // If we have data loaded, reload it to show the custom columns
    const params = new URLSearchParams(window.location.search);
    const pipeline = params.get('pipeline');
    const stepName = params.get('stepName');

    if (pipeline && stepName) {
      this.loadStepTimeSeries(pipeline, stepName);
    }
  },

  /**
   * Set up event listeners for step stats custom columns
   */
  setupStepStatsCustomColumnListeners() {
    // Setup event delegation for removing custom columns
    const activeColumnsContainer = document.getElementById('step-stats-active-custom-columns');

    activeColumnsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-column') || e.target.closest('.remove-column')) {
        const columnName = e.target.closest('.custom-column-badge').getAttribute('data-column-name');

        // Remove from active columns
        app.state.stepStatsActiveColumns = app.state.stepStatsActiveColumns.filter((c) => c.name !== columnName);

        // Update UI
        this.updateStepStatsCustomColumns();

        // Update the dropdown to show this column again
        app.updateStepStatsColumnsDropdown();
      }
    });

    // Initial update of custom columns
    this.updateStepStatsCustomColumns();
  },
};
