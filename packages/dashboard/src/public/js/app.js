/**
 * Main application code for StepsTrack Portal
 */

// Global app object
const app = {
  // State management - only for UI interactions
  state: {
    currentView: 'runs-view',
    autoRefresh: false,
    refreshInterval: null,
    refreshFrequency: 3000,
    expandedRows: new Set(), // Track expanded rows in UI
    stepsExpandedRows: new Set(), // Track expanded rows in step stats UI
    globalDateRange: {
      startDate: null,
      endDate: null,
      timePreset: '1440', // Default to last 24 hours
    },
    stepsPagination: null, // Added for pagination state
    presetColumns: [], // Preset data columns for custom table columns
    activeColumns: [], // Currently active custom columns in steps table
    stepStatsActiveColumns: [], // Currently active custom columns in step stats table
    timestampColumns: [], // Added for timestamp columns
  },

  /**
   * Initialize the dashboard
   */
  initDashboard() {
    // Check URL parameters on load
    const params = new URLSearchParams(window.location.search);
    const pipeline = params.get('pipeline');
    const view = params.get('view') || 'runs-view';
    const runId = params.get('runId');
    const stepKey = params.get('stepKey');
    const stepName = params.get('stepName');
    const timePreset = params.get('timePreset') || '1440';
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');

    // Initialize state from URL parameters
    this.state.currentView = view;
    this.state.globalDateRange.timePreset = timePreset;
    this.state.globalDateRange.startDate = startDate;
    this.state.globalDateRange.endDate = endDate;

    // Load preset columns from localStorage
    this.loadPresetColumns();

    // Initialize timestamp columns
    this.initTimestampColumns();

    // Initialize UI elements
    this.initUIElements();

    // Initialize settings UI
    this.initSettingsUI();

    // Fetch pipelines
    api.fetchPipelines().then((pipelines) => {
      // Populate global pipeline dropdown
      const globalPipelineSelect = document.getElementById('global-pipeline-select');
      globalPipelineSelect.innerHTML = '<option value="">Select a pipeline</option>';

      pipelines.forEach((pipeline) => {
        globalPipelineSelect.innerHTML += `<option value="${pipeline}">${pipeline}</option>`;
      });

      // Set the pipeline from URL if available
      if (pipeline) {
        globalPipelineSelect.value = pipeline;

        // Load data based on the selected pipeline and view
        this.handleInitialView(view, runId, stepKey, stepName, pipeline);
      } else {
        // If no pipeline is selected, still handle the initial view
        this.handleInitialView(view, runId, stepKey, stepName);
      }
    });

    // Initialize time range presets
    ui.initTimePresets();

    // Initialize date pickers
    ui.initDatePickers();
  },

  /**
   * Handle initial view display based on URL parameters
   * @param {string} view - View parameter from URL
   * @param {string} runId - Run ID from URL
   * @param {string} stepKey - Step key from URL
   * @param {string} stepName - Step name from URL
   * @param {string} pipeline - Pipeline from URL
   */
  handleInitialView(view, runId, stepKey, stepName, pipeline) {
    // Map URL view parameter to actual view IDs
    // Ensure all valid views are mapped correctly
    const viewId =
      view === 'run-detail'
        ? 'run-detail-view'
        : view === 'step-analysis'
          ? 'step-analysis-view'
          : view === 'step-stats-view'
            ? 'step-stats-view'
            : view === 'import' // Added mapping for import view
              ? 'import-view'
              : view === 'settings' // Added mapping for settings view
                ? 'settings-view'
                : 'runs-view'; // Default to runs view if unknown

    // Now use the correctly mapped viewId to show the view
    ui.showView(viewId);

    // Load data based on the view *after* showing it
    if (viewId === 'run-detail-view' && runId) {
      ui.loadRunDetails(runId, false);
    } else if (viewId === 'step-analysis-view' && runId && stepKey) {
      // Fetch step data for analysis view
      fetch(`/api/dashboard/runs/${runId}/step/${stepKey}`)
        .then((response) => response.json())
        .then((step) => {
          // Ensure the view is still analysis before updating content
          if (app.state.currentView === 'step-analysis-view') {
            document.getElementById('step-analysis-details').innerHTML = `
              <p><strong>Step Key:</strong> ${step.key}</p>
              <p><strong>Start Time:</strong> ${utils.formatDateTime(step.time.startTs)}</p>
              <p><strong>End Time:</strong> ${utils.formatDateTime(step.time.endTs)}</p>
              <p><strong>Duration:</strong> ${utils.formatDuration(step.time.timeUsageMs)}</p>
            `;
          }
        });
    } else if (viewId === 'step-stats-view') {
      // Step stats data loading is handled within ui.showView
      // based on pipeline and stepName parameters, no specific call needed here
    } else if (viewId === 'runs-view' && pipeline) {
      ui.loadRuns(pipeline);
    }
    // No specific data loading needed for import-view or settings-view on initial load
  },

  /**
   * Initialize UI elements and event listeners
   */
  initUIElements() {
    // Navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.getAttribute('data-view');

        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('view', viewId);

        // Clear other parameters if going to main views
        if (viewId === 'runs-view') {
          url.searchParams.delete('runId');
          url.searchParams.delete('stepKey');
          url.searchParams.delete('stepName');
        } else if (viewId === 'step-stats-view') {
          url.searchParams.delete('runId');
          url.searchParams.delete('stepKey');

          // Keep stepName if it exists in URL
          const stepName = url.searchParams.get('stepName');
          if (!stepName) {
            url.searchParams.delete('stepName');
          }
        } else if (viewId === 'import-view') {
          url.searchParams.delete('runId');
          url.searchParams.delete('stepKey');
          url.searchParams.delete('stepName');
        }

        window.history.pushState({ view: viewId }, '', url);

        // Show the view
        ui.showView(viewId);
      });
    });

    // Back buttons
    document.getElementById('back-to-runs').addEventListener('click', (e) => {
      e.preventDefault();

      // Reset expanded rows state when exiting run detail view
      this.state.expandedRows = new Set();

      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('view', 'runs-view');
      url.searchParams.delete('runId');
      url.searchParams.delete('stepKey');

      // Use pushState to ensure it's added to history properly
      window.history.pushState({ view: 'runs-view' }, '', url);

      // Show the view
      ui.showView('runs-view');
    });

    document.getElementById('back-to-run-detail').addEventListener('click', (e) => {
      e.preventDefault();

      // Get runId from URL
      const params = new URLSearchParams(window.location.search);
      const runId = params.get('runId');

      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('view', 'run-detail');
      if (runId) {
        url.searchParams.set('runId', runId);
      }
      url.searchParams.delete('stepKey');
      window.history.pushState({ view: 'run-detail', runId }, '', url);

      // Show the view
      ui.showView('run-detail-view');
    });

    // Global pipeline selector
    document.getElementById('global-pipeline-select').addEventListener('change', function () {
      const pipeline = this.value;
      if (pipeline) {
        // Update URL with selected pipeline
        const url = new URL(window.location);
        url.searchParams.set('pipeline', pipeline);

        // Get the current view from URL
        const view = url.searchParams.get('view') || 'runs-view';

        // Update history with new URL
        window.history.replaceState({ view, pipeline }, '', url);

        // Load data based on current view
        if (view === 'runs-view') {
          ui.loadRuns(pipeline);
        } else if (view === 'step-stats-view') {
          ui.loadStepNames(pipeline);
          // Clear step name selection
          document.getElementById('step-name-select').innerHTML = '<option value="">Select a step</option>';
          url.searchParams.delete('stepName');
          window.history.replaceState({ view, pipeline }, '', url);
        }

        // Start auto-refresh if enabled
        if (app.state.autoRefresh && view === 'runs-view') {
          app.startAutoRefresh();
        }
      }
    });

    // Step name selector
    document.getElementById('step-name-select').addEventListener('change', function () {
      const stepName = this.value;

      // Update URL with selected step name
      const url = new URL(window.location);
      const pipeline = url.searchParams.get('pipeline');

      if (stepName) {
        url.searchParams.set('view', 'step-stats-view');
        url.searchParams.set('stepName', stepName);

        // Reset pagination to page 1 when changing steps
        if (app.state.stepsPagination) {
          app.state.stepsPagination.page = 1;
        }

        // Clear expanded rows when changing steps
        if (app.state.stepsExpandedRows) {
          app.state.stepsExpandedRows.clear();
        }

        if (pipeline) {
          // Load step instances when a step is selected
          ui.loadStepTimeSeries(pipeline, stepName);
        }
      } else {
        // If no step is selected, remove the stepName parameter from URL
        url.searchParams.delete('stepName');
      }

      // Update history with new URL
      window.history.pushState({ view: 'step-stats-view', stepName }, '', url);
    });

    // Global date filter apply button
    document.getElementById('global-apply-filter').addEventListener('click', function () {
      // Get values from the global date range selector
      const timePreset = document.getElementById('global-time-preset-select').value;
      const startDate = document.getElementById('global-start-date').value;
      const endDate = document.getElementById('global-end-date').value;

      // Update URL with date range parameters
      const url = new URL(window.location);
      url.searchParams.set('timePreset', timePreset);

      if (startDate) {
        url.searchParams.set('startDate', startDate);
      } else {
        url.searchParams.delete('startDate');
      }

      if (endDate) {
        url.searchParams.set('endDate', endDate);
      } else {
        url.searchParams.delete('endDate');
      }

      // Update history with new URL
      window.history.replaceState({}, '', url);

      // Update global date range state as fallback
      app.state.globalDateRange.timePreset = timePreset;
      app.state.globalDateRange.startDate = startDate;
      app.state.globalDateRange.endDate = endDate;

      // Apply the filter based on current view
      const view = url.searchParams.get('view') || 'runs-view';
      const pipeline = url.searchParams.get('pipeline');

      if (pipeline) {
        if (view === 'runs-view') {
          ui.loadRuns(pipeline);
        } else if (view === 'step-stats-view') {
          const stepName = url.searchParams.get('stepName');
          if (stepName) {
            ui.loadStepTimeSeries(pipeline, stepName);
          }
        }
      }
    });

    // Auto-refresh controls
    const globalAutoRefreshCheckbox = document.getElementById('global-auto-refresh');
    const globalRefreshIntervalSelect = document.getElementById('global-refresh-interval');
    const refreshIndicator = document.querySelector('.refresh-indicator');

    globalAutoRefreshCheckbox.addEventListener('change', function () {
      app.state.autoRefresh = this.checked;
      refreshIndicator.classList.toggle('active', this.checked);

      // Enable/disable the refresh interval dropdown based on checkbox state
      globalRefreshIntervalSelect.disabled = !this.checked;

      if (this.checked) {
        app.startAutoRefresh();
      } else {
        app.stopAutoRefresh();
      }
    });

    globalRefreshIntervalSelect.addEventListener('change', function () {
      app.state.refreshFrequency = parseInt(this.value);
      if (app.state.autoRefresh) {
        app.startAutoRefresh();
      }
    });

    // Set initial state of refresh interval dropdown based on auto-refresh checkbox
    globalRefreshIntervalSelect.disabled = !globalAutoRefreshCheckbox.checked;

    // Set initial state of refresh indicator based on auto-refresh state
    refreshIndicator.classList.toggle('active', this.state.autoRefresh);

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (_event) => {
      // Read URL parameters
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view') || 'runs-view';
      const runId = params.get('runId');
      const stepKey = params.get('stepKey');
      const stepName = params.get('stepName');
      const pipeline = params.get('pipeline');

      // Reset UI interactions state when navigating back
      app.state.expandedRows = new Set();

      // Use the handleInitialView method for consistent navigation
      app.handleInitialView(view, runId, stepKey, stepName, pipeline);
    });

    // Initialize file import functionality
    this.initImportUI();

    // Run ID Search
    const runIdSearchInput = document.getElementById('run-id-search');
    const runIdSearchButton = document.getElementById('run-id-search-button');

    const triggerRunSearch = () => {
      const pipeline = document.getElementById('global-pipeline-select').value;
      if (pipeline) {
        // Reset to page 1 when searching
        if (app.state.pagination) {
          app.state.pagination.page = 1;
        }
        ui.loadRuns(pipeline);
      }
    };

    runIdSearchButton.addEventListener('click', triggerRunSearch);

    runIdSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        triggerRunSearch();
      }
    });
  },

  /**
   * Initialize the file import UI elements
   */
  initImportUI() {
    // Get DOM elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileListBody = document.getElementById('file-list-body');
    const fileListContainer = document.getElementById('file-list');
    const importFilesBtn = document.getElementById('import-files-btn');
    const importResultsContainer = document.getElementById('import-results');
    const importResultsBody = document.getElementById('import-results-body');

    // Files array to store selected files
    let selectedFiles = [];

    // Simple drag and drop implementation
    dropArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.add('highlight');
    });

    dropArea.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.remove('highlight');
    });

    dropArea.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.remove('highlight');

      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    });

    // Allow clicking anywhere in drop area to trigger file input
    dropArea.addEventListener('click', function (e) {
      // Don't trigger if they clicked on the actual button
      if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        fileInput.click();
      }
    });

    // Handle file selection via browse button
    fileInput.addEventListener('change', function () {
      if (this.files.length > 0) {
        handleFiles(this.files);
      }
    });

    // Process selected files
    function handleFiles(files) {
      // Convert FileList to array and filter to ensure we only process JSON files
      const newFiles = Array.from(files).filter((_file) => {
        // Check if file is a JSON file
        // return file.name.toLowerCase().endsWith('.json');
        return true;
      });

      // if (newFiles.length === 0) {
      //   alert('Please select JSON files only.');
      //   return;
      // }

      // Add new files to selectedFiles array
      selectedFiles = [...selectedFiles, ...newFiles];

      // Update the file list UI
      updateFileList();
    }

    // Update the file list display
    function updateFileList() {
      // Show the file list container if files are selected
      if (selectedFiles.length > 0) {
        fileListContainer.classList.remove('d-none');
      } else {
        fileListContainer.classList.add('d-none');
      }

      // Clear the current file list
      fileListBody.innerHTML = '';

      // Add each file to the list
      selectedFiles.forEach((file, index) => {
        const fileSize = formatFileSize(file.size);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${file.name}</td>
          <td>${fileSize}</td>
          <td>Ready</td>
          <td>
            <span class="file-item-remove" data-index="${index}">
              <i class="fas fa-times"></i>
            </span>
          </td>
        `;
        fileListBody.appendChild(row);
      });

      // Add event listeners to remove buttons
      document.querySelectorAll('.file-item-remove').forEach((btn) => {
        btn.addEventListener('click', function () {
          const index = parseInt(this.getAttribute('data-index'), 10);
          selectedFiles.splice(index, 1);
          updateFileList();
        });
      });
    }

    // Format file size for display
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';

      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));

      return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Handle the import button click
    importFilesBtn.addEventListener('click', async function () {
      if (selectedFiles.length === 0) return;

      // Show import results container
      importResultsContainer.classList.remove('d-none');
      importResultsBody.innerHTML = '';

      // Set all files to uploading status
      for (let i = 0; i < selectedFiles.length; i++) {
        const fileRow = fileListBody.children[i];
        fileRow.querySelector('td:nth-child(3)').textContent = 'Uploading...';
      }

      try {
        // Create form data with all selected files
        const formData = new FormData();
        selectedFiles.forEach((file) => {
          formData.append('stepsFiles', file);
        });

        // Use the unified steps files upload endpoint
        const response = await fetch('/api/dashboard/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        console.log('Upload response:', result);

        if (result.success && result.results) {
          // Process each file result
          result.results.forEach((fileResult, index) => {
            const fileRow = fileListBody.children[index];

            if (fileResult.success) {
              fileRow.classList.add('success');
              fileRow.querySelector('td:nth-child(3)').textContent = 'Imported';
            } else {
              fileRow.classList.add('error');
              fileRow.querySelector('td:nth-child(3)').textContent = 'Failed';
            }

            // Add to results list
            const resultRow = document.createElement('tr');
            resultRow.innerHTML = `
              <td>${fileResult.filename}</td>
              <td>${fileResult.success ? '<span class="text-success">Success</span>' : '<span class="text-danger">Failed</span>'}</td>
              <td>${fileResult.message || fileResult.error || ''}</td>
            `;
            importResultsBody.appendChild(resultRow);
          });
        } else {
          throw new Error(result.message || 'Unknown error');
        }
      } catch (error) {
        console.error('Error during upload:', error);

        // Update all files to error state
        for (let i = 0; i < selectedFiles.length; i++) {
          const fileRow = fileListBody.children[i];
          fileRow.classList.add('error');
          fileRow.querySelector('td:nth-child(3)').textContent = 'Error';
        }

        // Add a single error message
        const resultRow = document.createElement('tr');
        resultRow.innerHTML = `
          <td colspan="2"><span class="text-danger">Upload Error</span></td>
          <td>${error.message || 'Unknown error occurred during upload'}</td>
        `;
        importResultsBody.appendChild(resultRow);
      }
    });
  },

  /**
   * Start auto-refresh for the current view
   */
  startAutoRefresh() {
    this.stopAutoRefresh(); // Clear any existing refresh

    // Set auto-refresh state
    this.state.autoRefresh = true;

    // Start a new interval
    this.state.refreshInterval = setInterval(() => {
      // Check if auto-refresh is still enabled
      if (!this.state.autoRefresh) {
        this.stopAutoRefresh();
        return;
      }

      // Refresh data based on the current view
      const currentView = this.state.currentView;
      const params = new URLSearchParams(window.location.search);
      const pipeline = params.get('pipeline');
      const runId = params.get('runId');

      // Only refresh data for views that display dynamic run/step info
      if (currentView === 'runs-view' && pipeline) {
        ui.loadRuns(pipeline);
      } else if (currentView === 'run-detail-view' && runId) {
        ui.loadRunDetails(runId, true); // Pass true for auto-refresh
      }
      // Do nothing if on import-view or settings-view or other static views
    }, this.state.refreshFrequency);
  },

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    // Set auto-refresh state
    this.state.autoRefresh = false;

    // Clear existing interval if any
    if (this.state.refreshInterval) {
      clearInterval(this.state.refreshInterval);
      this.state.refreshInterval = null;
    }
  },

  /**
   * Initialize Settings UI
   */
  initSettingsUI() {
    // Data Retention Settings
    const retentionForm = document.getElementById('retention-settings-form');
    const retentionDaysInput = document.getElementById('retention-days');

    // Load current pipeline
    const currentPipeline = this.state.selectedPipeline;
    if (currentPipeline) {
      // Load settings for current pipeline
      api
        .getSettings(currentPipeline)
        .then((settings) => {
          if (settings && settings.dataRetentionDays) {
            retentionDaysInput.value = settings.dataRetentionDays;
          } else {
            retentionDaysInput.value = 14; // Default value
          }
        })
        .catch(() => {
          retentionDaysInput.value = 14; // Default value on error
        });
    }

    // Handle retention settings form submission
    retentionForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const retentionDays = parseInt(retentionDaysInput.value, 10);
      if (isNaN(retentionDays) || retentionDays < 1) {
        alert('Please enter a valid retention period (minimum 1 day)');
        return;
      }

      // Get current settings
      const currentPipeline = this.state.selectedPipeline;
      if (!currentPipeline) {
        alert('Please select a pipeline first');
        return;
      }

      let settings = (await api.getSettings(currentPipeline)) || {};

      // Update retention days
      settings.dataRetentionDays = retentionDays;

      // Save settings
      const result = await api.saveSettings(currentPipeline, settings);
      if (result.success) {
        ui.showToast('Success', 'Data retention settings saved successfully');
      } else {
        ui.showToast('Error', 'Failed to save settings', 'error');
      }
    });

    // Add Preset Column Button
    const addPresetColumnBtn = document.getElementById('add-preset-column');
    const presetColumnModal = new bootstrap.Modal(document.getElementById('preset-column-modal'));
    const savePresetColumnBtn = document.getElementById('save-preset-column');
    const presetColumnForm = document.getElementById('preset-column-form');
    const presetColumnIndex = document.getElementById('preset-column-index');
    const presetColumnName = document.getElementById('preset-column-name');
    const presetColumnPath = document.getElementById('preset-column-path');
    const presetColumnPipeline = document.getElementById('preset-column-pipeline');
    const modalElement = document.getElementById('preset-column-modal');

    // Get the new path selection elements
    const dataPathRoot = document.getElementById('data-path-root');
    const dataPathNested = document.getElementById('data-path-nested');
    const nestedPathContainer = document.getElementById('nested-path-container');

    // Function to update the hidden path field
    const updatePathField = () => {
      const rootValue = dataPathRoot.value;
      const nestedValue = dataPathNested.value;
      const pathPreview = document.getElementById('path-preview');

      if (rootValue) {
        // Always show nested path field for both records and result
        presetColumnPath.value = nestedValue ? `${rootValue}.${nestedValue}` : rootValue;
        nestedPathContainer.style.display = 'block';
        pathPreview.textContent = nestedValue ? `${rootValue}.${nestedValue}` : rootValue;
        pathPreview.classList.add('bg-light', 'px-2', 'py-1', 'rounded');
      } else {
        presetColumnPath.value = '';
        nestedPathContainer.style.display = 'block';
        pathPreview.textContent = '';
        pathPreview.classList.remove('bg-light', 'px-2', 'py-1', 'rounded');
      }
    };

    // Update hidden path field when root or nested path changes
    dataPathRoot.addEventListener('change', updatePathField);
    dataPathNested.addEventListener('input', updatePathField);

    // Add event listener for the close button
    const closeButton = modalElement.querySelector('.btn-close');
    closeButton.addEventListener('click', () => {
      presetColumnModal.hide();
    });

    // Add event listener for the cancel button
    const cancelButton = modalElement.querySelector('.modal-footer .btn-secondary');
    cancelButton.addEventListener('click', () => {
      presetColumnModal.hide();
    });

    // Populate pipeline dropdown in the modal
    api.fetchPipelines().then((pipelines) => {
      presetColumnPipeline.innerHTML = '<option value="">All Pipelines</option>';
      pipelines.forEach((pipeline) => {
        presetColumnPipeline.innerHTML += `<option value="${pipeline}">${pipeline}</option>`;
      });
    });

    // Ensure modal properly initializes Bootstrap events
    modalElement.addEventListener('hidden.bs.modal', () => {
      // Clean up or reset the form when modal is hidden
      presetColumnIndex.value = '';
      presetColumnName.value = '';
      presetColumnPath.value = '';
      dataPathRoot.value = '';
      dataPathNested.value = '';
      presetColumnPipeline.value = '';
      nestedPathContainer.style.display = 'block';
      document.getElementById('path-preview').textContent = '';
    });

    // Render preset columns table
    this.renderPresetColumnsTable();

    // Add column button
    addPresetColumnBtn.addEventListener('click', () => {
      presetColumnIndex.value = '';
      presetColumnName.value = '';
      presetColumnPath.value = '';
      dataPathRoot.value = '';
      dataPathNested.value = '';
      presetColumnPipeline.value = '';
      nestedPathContainer.style.display = 'block';
      document.getElementById('path-preview').textContent = '';
      document.getElementById('preset-column-modal-title').textContent = 'Add Preset Column';
      presetColumnModal.show();
    });

    // Save column button
    savePresetColumnBtn.addEventListener('click', () => {
      // Update the path field one last time before validation
      updatePathField();

      if (!presetColumnForm.checkValidity()) {
        presetColumnForm.reportValidity();
        return;
      }

      // Additional validation to ensure root is either records or result
      const rootValue = dataPathRoot.value;
      if (rootValue !== 'records' && rootValue !== 'result') {
        alert('Data source must be either "records" or "result"');
        return;
      }

      const index = presetColumnIndex.value;
      const column = {
        name: presetColumnName.value,
        path: presetColumnPath.value,
        pipeline: presetColumnPipeline.value,
      };

      if (index === '') {
        // Add new column
        this.state.presetColumns.push(column);
      } else {
        // Update existing column
        this.state.presetColumns[parseInt(index, 10)] = column;
      }

      // Save to localStorage
      localStorage.setItem('presetColumns', JSON.stringify(this.state.presetColumns));

      // Update UI
      this.renderPresetColumnsTable();
      this.updatePresetColumnsDropdown();

      // Close modal
      presetColumnModal.hide();
    });

    // Delete column event delegation
    document.getElementById('preset-columns-table').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-column-btn') || e.target.closest('.delete-column-btn')) {
        const index = e.target.closest('.delete-column-btn').getAttribute('data-index');
        if (confirm('Are you sure you want to delete this column?')) {
          this.state.presetColumns.splice(parseInt(index, 10), 1);
          localStorage.setItem('presetColumns', JSON.stringify(this.state.presetColumns));
          this.renderPresetColumnsTable();
          this.updatePresetColumnsDropdown();

          // Also remove from active columns if it was active
          this.state.activeColumns = this.state.activeColumns.filter(
            (c) => c.name !== this.state.presetColumns[parseInt(index, 10)]?.name,
          );
          ui.updateCustomColumns();
        }
      }

      // Edit column event
      if (e.target.classList.contains('edit-column-btn') || e.target.closest('.edit-column-btn')) {
        const index = e.target.closest('.edit-column-btn').getAttribute('data-index');
        const column = this.state.presetColumns[parseInt(index, 10)];

        presetColumnIndex.value = index;
        presetColumnName.value = column.name;

        // Parse the path to set root and nested parts
        const pathParts = column.path.split('.');
        const rootPath = pathParts[0];

        // Only allow records or result as root path
        if (rootPath !== 'records' && rootPath !== 'result') {
          alert('This column uses an unsupported data source. Please update it to use either "records" or "result".');
          dataPathRoot.value = '';
          dataPathNested.value = '';
        } else {
          dataPathRoot.value = rootPath;
          dataPathNested.value = pathParts.slice(1).join('.');
        }

        nestedPathContainer.style.display = 'block';

        // Set the hidden path field
        presetColumnPath.value = column.path;

        // Update the path preview
        document.getElementById('path-preview').textContent = column.path;

        presetColumnPipeline.value = column.pipeline || '';

        document.getElementById('preset-column-modal-title').textContent = 'Edit Preset Column';
        presetColumnModal.show();
      }
    });
  },

  /**
   * Load preset columns from localStorage
   */
  loadPresetColumns() {
    try {
      const storedColumns = localStorage.getItem('presetColumns');
      if (storedColumns) {
        this.state.presetColumns = JSON.parse(storedColumns);
      }
    } catch (error) {
      console.error('Error loading preset columns:', error);
      this.state.presetColumns = [];
    }
  },

  /**
   * Render preset columns table
   */
  renderPresetColumnsTable() {
    const tableBody = document.querySelector('#preset-columns-table tbody');

    if (!this.state.presetColumns || this.state.presetColumns.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No preset columns defined</td></tr>';
      return;
    }

    tableBody.innerHTML = '';
    this.state.presetColumns.forEach((column, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${column.name}</td>
        <td><code>${column.path}</code></td>
        <td>${column.pipeline || 'All'}</td>
        <td>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary edit-column-btn" data-index="${index}" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-column-btn" data-index="${index}" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(row);
    });
  },

  /**
   * Update preset columns dropdown in the steps table
   */
  updatePresetColumnsDropdown() {
    const dropdown = document.getElementById('preset-columns-dropdown');
    dropdown.innerHTML = '';

    let hasItems = false;

    // Add timestamp columns first
    if (this.state.timestampColumns && this.state.timestampColumns.length > 0) {
      this.state.timestampColumns.forEach((column, index) => {
        // Check if this column is already active
        const isActive = this.state.activeColumns.some((c) => c.name === column.name);

        if (!isActive) {
          const item = document.createElement('li');
          item.innerHTML = `<a class="dropdown-item timestamp-column" href="#" data-index="${index}">${column.name}</a>`;
          dropdown.appendChild(item);
          hasItems = true;
        }
      });

      // Add a divider if we have both timestamp columns and preset columns
      if (this.state.presetColumns && this.state.presetColumns.length > 0) {
        const divider = document.createElement('li');
        divider.innerHTML = '<hr class="dropdown-divider">';
        dropdown.appendChild(divider);
      }
    }

    // Get current pipeline from URL
    const params = new URLSearchParams(window.location.search);
    const currentPipeline = params.get('pipeline') || '';

    // Add user-defined preset columns
    if (this.state.presetColumns && this.state.presetColumns.length > 0) {
      this.state.presetColumns.forEach((column, index) => {
        // Only show columns that apply to all pipelines or the current pipeline
        if (!column.pipeline || column.pipeline === currentPipeline) {
          // Check if this column is already active
          const isActive = this.state.activeColumns.some((c) => c.name === column.name);

          if (!isActive) {
            const item = document.createElement('li');
            item.innerHTML = `<a class="dropdown-item" href="#" data-index="${index}">${column.name}</a>`;
            dropdown.appendChild(item);
            hasItems = true;
          }
        }
      });
    }

    // Add "No available columns" message if no columns are available
    if (!hasItems) {
      const noColumnsItem = document.createElement('li');
      noColumnsItem.innerHTML = '<span class="dropdown-item-text">No preset columns defined</span>';
      dropdown.appendChild(noColumnsItem);
    }

    // Add event listeners to dropdown items
    dropdown.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        // Handle timestamp columns differently
        if (item.classList.contains('timestamp-column')) {
          const index = parseInt(e.target.getAttribute('data-index'), 10);
          const column = this.state.timestampColumns[index];

          // Add to active columns
          this.state.activeColumns.push(column);
        } else {
          const index = parseInt(e.target.getAttribute('data-index'), 10);
          const column = this.state.presetColumns[index];

          // Add to active columns
          this.state.activeColumns.push(column);
        }

        // Update UI
        ui.updateCustomColumns();
      });
    });
  },

  /**
   * Update preset columns dropdown in the step stats table
   */
  updateStepStatsColumnsDropdown() {
    const dropdown = document.getElementById('step-stats-preset-columns-dropdown');
    dropdown.innerHTML = '';

    let hasItems = false;

    // Add timestamp columns first
    if (this.state.timestampColumns && this.state.timestampColumns.length > 0) {
      this.state.timestampColumns.forEach((column, index) => {
        // Check if this column is already active
        const isActive = this.state.stepStatsActiveColumns.some((c) => c.name === column.name);

        if (!isActive) {
          const item = document.createElement('li');
          item.innerHTML = `<a class="dropdown-item timestamp-column" href="#" data-index="${index}">${column.name}</a>`;
          dropdown.appendChild(item);
          hasItems = true;
        }
      });

      // Add a divider if we have both timestamp columns and preset columns
      if (this.state.presetColumns && this.state.presetColumns.length > 0) {
        const divider = document.createElement('li');
        divider.innerHTML = '<hr class="dropdown-divider">';
        dropdown.appendChild(divider);
      }
    }

    // Get current pipeline from URL
    const params = new URLSearchParams(window.location.search);
    const currentPipeline = params.get('pipeline') || '';

    // Add user-defined preset columns
    if (this.state.presetColumns && this.state.presetColumns.length > 0) {
      this.state.presetColumns.forEach((column, index) => {
        // Only show columns that apply to all pipelines or the current pipeline
        if (!column.pipeline || column.pipeline === currentPipeline) {
          // Check if this column is already active
          const isActive = this.state.stepStatsActiveColumns.some((c) => c.name === column.name);

          if (!isActive) {
            const item = document.createElement('li');
            item.innerHTML = `<a class="dropdown-item" href="#" data-index="${index}">${column.name}</a>`;
            dropdown.appendChild(item);
            hasItems = true;
          }
        }
      });
    }

    // Add "No available columns" message if no columns are available
    if (!hasItems) {
      const noColumnsItem = document.createElement('li');
      noColumnsItem.innerHTML = '<span class="dropdown-item-text">No preset columns defined</span>';
      dropdown.appendChild(noColumnsItem);
    }

    // Add event listeners to dropdown items
    dropdown.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        // Handle timestamp columns differently
        if (item.classList.contains('timestamp-column')) {
          const index = parseInt(e.target.getAttribute('data-index'), 10);
          const column = this.state.timestampColumns[index];

          // Add to active columns
          this.state.stepStatsActiveColumns.push(column);
        } else {
          const index = parseInt(e.target.getAttribute('data-index'), 10);
          const column = this.state.presetColumns[index];

          // Add to active columns
          this.state.stepStatsActiveColumns.push(column);
        }

        // Update UI
        ui.updateStepStatsCustomColumns();
      });
    });
  },

  /**
   * Initialize hard-coded timestamp columns for steps table
   */
  initTimestampColumns() {
    // Define the timestamp columns to be available in the dropdown
    this.state.timestampColumns = [
      {
        name: 'Start Time (UTC)',
        path: 'time.startTs',
        isTimestamp: true,
      },
      {
        name: 'End Time (UTC)',
        path: 'time.endTs',
        isTimestamp: true,
      },
    ];
  },
};

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  app.initDashboard();

  // Initialize browser history navigation
  window.addEventListener('popstate', (_event) => {
    // Read URL parameters
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'runs-view';
    const runId = params.get('runId');
    const stepKey = params.get('stepKey');
    const stepName = params.get('stepName');
    const pipeline = params.get('pipeline');

    // Reset UI interactions state when navigating back
    app.state.expandedRows = new Set();

    // Use the handleInitialView method for consistent navigation
    app.handleInitialView(view, runId, stepKey, stepName, pipeline);
  });
});
