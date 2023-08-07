import {
    OmniElement,
    OmniStyleElement,
    OmniIconElement,
    html,
    css,
    OmniTooltipElement,
    ImageAPI,
    OmniImageInputElement,
    OmniSwitchElement,
  } from 'omni-ui';
  import { ssofetch } from './sso';
  import './bulma-dropdown';
  import { omnialert } from './alert';
  import PBIEmbed from './pbi-embed';
  import { checkForCreatedReportNames, getAllSubscribedReports } from './subscription-service';
  import { debounce } from './portal-utils.js';
  import { getSessionInfo } from './utility.js';
  import { checkFileName, getEnv } from './image-utility';
  import { IMAGE_SIZE_ERROR, INVALID_IMAGE, IMAGE_UNAUTHORIZED } from './constants';
  import { ReportPages } from './enums';
  import 'lit-flatpickr';
  /* eslint no-param-reassign: ["error", { "props": false }] */
  
  OmniStyleElement.register();
  OmniIconElement.register();
  OmniTooltipElement.register();
  OmniImageInputElement.register();
  OmniSwitchElement.register();
  
  const INPUT_DEBOUNCE_TIMER = 250;
  
  export default class CreateReport extends OmniElement {
    constructor() {
      super();
      this.isDisabled = true;
      this.session = getSessionInfo();
      this.env = getEnv();
      this.filters = [];
      this.dimensionList = [];
      this.metricList = [];
      this.loading = false;
      this.imgPending = '';
      this.s3prefix = 'arn:aws:s3:::fbspina-distributions-';
      this.deliveryMethodTypes = [
        { label: 'Download', id: 'download' },
        { label: 'S3 Bucket', id: 's3' },
      ];
  
      this.deliveryFrequencyTypes = [
        { label: 'Daily', id: 'daily' },
        { label: 'Weekly', id: 'weekly' },
        { label: 'Monthly (on the 1st)', id: 'monthly' },
        { label: 'Quarterly', id: 'quarterly' },
        { label: 'Yearly', id: 'yearly' },
      ];
  
      ssofetch('/scheduler/reports/date_calcs')
        .then((response) => response.json())
        .then((json) => {
          this.dateCalcs = json.calcs;
        });
  
      this.loadSubscribedReportTypes();
      this.maxDate = new Date().toISOString().slice(0, 10);
      window.addEventListener('create', () => {
        this.createReport = true;
      });
      this.isSwitchPublic = true;
    }
    async loadSubscribedReportTypes() {
      this.reportTypes = [];
      const subscribedReportTypes = await getAllSubscribedReports();
      const is_report_type = subscribedReportTypes.reportType.filter(
        (it) => it.is_report && it.is_subscribed
      );
  
      is_report_type.map((item) => {
        const findItem = this.reportTypes.find((data) => data.name === `${item.name}`);
        if (!findItem) {
          this.reportTypes.push({
            id: item.id,
            category_id: item.category_id,
            name: item.name,
            description: item.description,
            path: item.template_path,
            dimensions: item.dimensions,
            metrics: item.metrics,
          });
        }
      });
      if (!this.reportTypes.length) {
        this.dispatchEvent(new Event('close'));
        return omnialert('No subscribed report type');
      }
      this.templates = this.reportTypes;
      [this.template] = this.templates;
      this.getDimensionMetricFields();
      this.isDuplicateReportName = false;
    }
  
    async getDimensionMetricFields() {
      const response = await ssofetch(
        `/api/v2/report-type-data-sources/${this.template?.id}?selection=ALL`
      );
      const resp = await response.json();
      const filterMetrics = resp.data.filter((d) => d.is_metric);
      const filterDimensions = resp.data.filter((d) => d.is_dimension);
      filterMetrics.map((metric) => {
        const idx = this.metricList.findIndex((m) => m.column === metric?.data_source_field?.name);
        if (idx === -1) {
          this.metricList.push({
            column: metric?.data_source_field?.name,
            label: metric?.label,
          });
        }
      });
      filterDimensions.map((dim) => {
        const idx = this.metricList.findIndex((m) => m.column === dim?.data_source_field?.name);
        if (idx === -1) {
          this.dimensionList.push({
            column: dim?.data_source_field?.name,
            label: dim?.label,
            filterable: dim?.is_filterable,
            is_enabled: dim?.is_enabled,
          });
        }
      });
    }
  
    static get properties() {
      return {
        template: { attribute: false },
        session: { attribute: false },
        dateCalcs: { attribute: false },
        filters: { attribute: false },
        saving: { attribute: false },
        maxDate: { attribute: false },
        value: { type: String },
        imgPending: { type: String },
        env: { type: String },
        loading: { type: Boolean },
        isDuplicateReportName: { attribute: false },
        isDisabled: { type: Boolean },
        isSwitchPublic: { type: Boolean },
        dimensionList: { type: Array },
        metricList: { type: Array },
      };
    }
  
    static get styles() {
      return [
        super.styles,
        css`
          .modal-card-body p {
            font-size: 0.8em !important;
            color: var(--color-shark);
          }
          input[type='date']::-webkit-calendar-picker-indicator {
            opacity: 0.5;
          }
          .narrow-input {
            width: 162px !important;
            vertical-align: unset !important;
          }
          .omni .skeleton::after {
            z-index: 4;
          }
          /* Try to avoid weird bug in firefox with transform-style: preserve-3d */
          @-moz-document url-prefix() {
            .omni .button {
              transform-style: unset !important;
            }
  
            .omni .button.is-outlined::before {
              background-image: none !important;
            }
  
            .omni .button.is-link.is-outlined.is-focused,
            .omni .button.is-link.is-outlined.is-hovered,
            .omni .button.is-link.is-outlined:focus,
            .omni .button.is-link.is-outlined:hover {
              background-color: var(--color-electric-blue) !important;
            }
          }
          input[type='checkbox'] {
            width: 16px;
            height: 16px;
            margin: 0 8px 0 0;
            vertical-align: bottom !important;
          }
          .header-separator {
            border-bottom: 1px solid rgb(241, 245, 250) !important;
            height: 43px;
          }
          .col-spacing {
            margin-bottom: 30px !important;
          }
          .omni .input,
          bulma-dropdown {
            background-color: #f2f5fa !important;
            border: 1px solid #edf0f5 !important;
          }
          .omni .input {
            height: 36px !important;
            color: var(--color-almost-black) !important;
            padding-left: 1.25em !important;
          }
          .omni .input:focus {
            background-color: #ffffff !important;
            border: 1px solid #0OA1D2 !important;
            box-shadow: rgb(0, 161, 210) 0px 0px 0px 1px !important;
          }
          .omni .button.is-outlined:focus {
            background-color: #ffffff !important;
            border: 1px solid var(--color-electric-blue) !important;
          }
          .omni .button.is-outlined:hover {
            background-color: var(--color-electric-blue) !important;
          }
          .omni .button.is-text omni-icon {
            fill: var(--color-electric-blue) !important;
          }
          .omni .button.is-text:hover omni-icon {
            fill: #ffffff !important;
          }
          .omni .button.is-text:active omni-icon {
            fill: var(--color-electric-blue) !important;
          }
          input[type='checkbox']:checked {
            filter: invert(1%) hue-rotate(360deg) brightness(1.4) !important;
          }
          .mb-16 {
            margin-bottom: 16px !important;
          }
          .no-border-background {
            border: 0px solid #ffffff !important;
            background-color: white !important;
            box-shadow: none !important;
          }
          .omni .button.no-border-background.is-text omni-icon {
            fill: var(--color-black) !important;
          }
          .omni .button.no-border-background.is-text:hover omni-icon {
            fill: var(--color-electric-blue) !important;
          }
          /* Without this, long names can force this component to overflow horizontally */
          omni-img-input::part(filename) {
            overflow-wrap: anywhere !important;
          }
          .is-disabled {
            pointer-events: none;
            opacity: 0.5;
          }
        `,
      ];
    }
    allMetrics() {
      // We add the "market" version of each metric. So our final list is twice as long.
      const all = [];
      if (this.template?.metrics) {
        this.template.metrics.forEach((metric) => {
          all.push(metric);
        });
        this.template.metrics.forEach((metric) => {
          all.push({
            ...metric,
            market: true,
            label: `(Market) ${metric.label}`,
          });
        });
      }
      return all;
    }
  
    allDimensions() {
      const all = [];
      if (this.template?.dimensions) {
        this.template.dimensions.forEach((dimension) => {
          if (dimension.enabled) all.push(dimension);
        });
      }
      return all;
    }
    nextId() {
      if (!this.currentIdNumber) this.currentIdNumber = 0;
      this.currentIdNumber += 1;
      return this.currentIdNumber;
    }
  
    getElementById(elementId, properties = [], defaultValue = undefined) {
      let element = this.shadowRoot.getElementById(elementId);
      for (let i = 0; i < properties.length; i += 1) {
        const property = properties[i];
        if (!element) return defaultValue;
        element = element[property];
      }
      return element === undefined ? defaultValue : element;
    }
  
    async save() {
      this.saving = true;
      this.isDisabled = false;
      try {
        await this.saveImpl();
      } catch (error){
        this.isDisabled = true;
      } finally {
        this.saving = false;
      }
    }
  
    async addAnalytic(data) {
      let reportData = {
        reportName: data.name,
        end_date: data.end_date,
        frequency: data.frequency,
        report_type_id: data.report_type_id,
        report_type_name: this.template.name,
        destination: data.destination,
        params: data.params,
        update_date: data.update_date,
        updated_by: data.updated_by,
        is_public: this.isSwitchPublic,
      };
      let event = 'reportCreated';
      window.dataLayer.push({ event, reportData });
    }
  
    async saveImpl() {
      const id = (...args) => this.getElementById(...args);
      const name = id('name-input', ['value']);
      const reportDateStart = id('report-date-range-start', ['value']);
      const reportDateStop = id('report-date-range-stop', ['value']);
      const dimensions = id('dimension-dropdown', ['value']).map((d) => ({
        column: d.column,
        label: d.label,
      }));
      const metrics = id('metrics-dropdown', ['value']).map((m) => ({
        op: m.op,
        column: m.column,
        market: m.market,
        label: m.label,
      }));
      const filters = this.filters.map((f) => ({
        column: f.column,
        value: f.value,
      }));
      const deliveryMethod = id('delivery-method-dropdown', ['value', 'id']);
      const deliveryDateStart = new Date().toISOString().split('T')[0];
      const deliveryDateStop = id('delivery-date-range-stop', ['value']);
      const deliveryFrequency = id('delivery-frequency-dropdown', ['value', 'id']);
      const dateCalc = id('report-date-range-dropdown', ['value']);
      const s3Suffix = id('s3-bucket-name', ['value']);
      const sendmail = id('sendmail', ['checked']);
      const update_date = new Date().toISOString().split('T')[0];
      const updated_by = this.session.user_id;
      const params = { filters, dimensions, metrics };
      if (name === '') {
        return omnialert('Please enter report name');
      }
      if (name.match(/^\s*$/)) {
        return omnialert('Report name cannot be only whitespace');
      }
      if (this.template.name !== 'Facebook Audience Intelligence') {
        
        if (!dateCalc || (dateCalc.id === 'custom' && (!reportDateStart || !reportDateStop))) {
          return omnialert('Specify a report date range');
        }
        if (dateCalc.id === 'custom' && reportDateStart > this.maxDate) {
          return omnialert("Report start date should not be greater than today's date.");
        }
        if (dateCalc.id === 'custom' && reportDateStop > this.maxDate) {
          return omnialert("Report stop date should not be greater than today's date.");
        }
        if (dateCalc.id === 'custom' && reportDateStart > reportDateStop) {
          return omnialert('Invalid report date range');
        }
        // For the report date range, *either* provide specific dates or the date calc
        if (dateCalc.id === 'custom') {
          params.start_date = reportDateStart;
          params.end_date = reportDateStop;
        } else {
          params.date_calc = dateCalc.id;
        }
      } else {
        params.date_calc = 'all-time';
      }
      if (dimensions.length === 0) {
        return omnialert('Select at least one dimension');
      }
      if (metrics.length === 0) {
        return omnialert('Select at least one metric');
      }
      if (!deliveryDateStop) {
        return omnialert('Specify an end date for the delivery schedule');
      }
      if (deliveryDateStart > deliveryDateStop) {
        return omnialert('Delivery schedule end date cannot be in the past');
      }
      if (!deliveryMethod) {
        return omnialert('Specify a delivery method');
      }
      if (deliveryMethod === 's3') {
        if (!s3Suffix) {
          return omnialert(`Enter the S3 Bucket name suffix (not including "${this.s3prefix}"`);
        }
        if (s3Suffix.match(/[^a-z0-9.-]/)) {
          return omnialert('Invalid characters in S3 Bucket name');
        }
      }
      if (!deliveryFrequency) {
        return omnialert('Specify a delivery frequency');
      }
      if (filters.find((filter) => !filter.column)) {
        return omnialert('Select a dimension column for your filter');
      }
      if (filters.find((filter) => filter.value === undefined || filter.value === null)) {
        return omnialert('Select a value for your filter');
      }
      if (this.imgPending) {
        return omnialert(this.imgPending);
      }
      const destination = { type: deliveryMethod };
      if (deliveryMethod === 's3') {
        destination.bucket = `${this.s3prefix}${s3Suffix}`;
      }
      if (sendmail) {
        destination.sendmail = true;
      }
      let data = {
        name,
        end_date: deliveryDateStop,
        frequency: deliveryFrequency,
        report_type_id: this.template.id,
        destination,
        params,
        update_date,
        updated_by,
        is_public: this.isSwitchPublic,
      };
      if (this.value) {
        data.image_url = this.value;
      }
      if (!this.isDuplicateReportName) {
        const response = await ssofetch('/scheduler/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await response.json();
        if (json.success) {
          // Push event to create the report
          this.addAnalytic(data);
          this.dispatchEvent(new Event('refresh'));
          this.dispatchEvent(new Event('close'));
        } else {
          omnialert(`Report creation failed: ${json.error}`);
        }
      }
      return null;
    }
  
    async listColumnValues(table, column, search = null) {
      const a = this;
      const embedJson = await PBIEmbed.getEmbedJson();
      const response = await ssofetch('/api/powerbi/listvalues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embed_token: embedJson.accessToken,
          table_name: table,
          column_name: column,
          search_string: search,
        }),
      });
      const json = await response.json();
      if (!json.success) throw Error(json.error);
      return json.values;
    }
  
    async loadFilterValues(filter) {
      filter.value = '';
      filter.values = [];
      this.requestUpdate();
  
      if (filter.dimension?.table) {
        filter.values.loading = true;
        this.requestUpdate();
        let result = [];
        try {
          result = await this.listColumnValues(filter.dimension.table, filter.dimension.column);
        } catch (e) {
          result = [];
        } finally {
          filter.values = result;
          filter.values.loading = false;
          this.requestUpdate();
        }
      }
    }
    async checkForReportNames() {
      const reportName = this.shadowRoot.getElementById('name-input')?.value;
      if (reportName) {
        const result = await checkForCreatedReportNames(reportName.trim());
        this.isDuplicateReportName = result?.reportTypeDetails?.length > 0;
        this.reportNameError = '';
      } else {
        this.isDuplicateReportName = false;
        this.reportNameError = true;
      }
      this.requestUpdate();
    }
  
    _setURL(value) {
      this.value = value;
      this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value } }));
    }
  
    async _setImage(e) {
      const imgInputElement = e.target;
      const file = e?.detail?.file;
      if (file && !file.name.match(/.(jpg|jpeg|png|gif)$/i)) {
        this.imgPending = INVALID_IMAGE;
        this._setURL(undefined);
        return;
      } else {
        if (!imgInputElement.reportValidity()) {
          this.imgPending = IMAGE_SIZE_ERROR;
          this._setURL(undefined);
          return;
        } else {
          this.imgPending = '';
        }
        if (file) {
          try {
            if (!this.session.ANsid) throw new Error("Missing ANsid: can't upload images");
            this.loading = true;
            const url = await new ImageAPI(this.session.ANsid, this.env).createImageURL(file);
            this._setURL(url);
          } catch (e2) {
            let message =
              e2.status === 414
                ? INVALID_IMAGE
                : e2.status === 403
                ? IMAGE_UNAUTHORIZED
                : e2?.message;
            omnialert(message);
            this.shadowRoot.querySelector('omni-img-input').reset(); // reset on error
          }
          this.loading = false;
        } else {
          this._setURL(undefined);
          return;
        }
      }
    }
  
    checkRptPermission() {
      const elem1 = this.shadowRoot?.getElementById('btnRadio1');
      const elem2 = this.shadowRoot?.getElementById('btnRadio2');
      if (elem1.checked) {
        elem2.checked = false;
        this.isSwitchPublic = true;
      } else {
        elem2.checked = true;
        this.isSwitchPublic = false;
      }
      this.requestUpdate();
    }
  
    resetForm() {
      const id = (...args) => this.getElementById(...args);
      // Clear other form elements when template changes
      id('dimension-dropdown').selected = [];
      id('metrics-dropdown').selected = [];
      id('report-date-range-dropdown').selected = [];
      id('name-input').value = '';
      id('delivery-method-dropdown').selected = [];
      id('delivery-frequency-dropdown').selected = [];
      id('delivery-date-range-stop').value = this.maxDate;
      id('sendmail').checked = false;
      this.isDuplicateReportName = false;
      this.filters = [];
    }
  
    renderModalBody() {
      const id = (...args) => this.getElementById(...args);
      const addNewFilter = () => {
        this.filters.push({
          id: this.nextId(),
          values: [],
          value: null,
          column: null,
          dimension: null,
        });
        this.requestUpdate();
      };
     
    const hasValidationErrors = () => {
    const id = (...args) => this.getElementById(...args);
  
    if (!id("name-input")?.value || this.isDuplicateReportName || this.reportNameError) {
      return true;
    }
  
    if (id("report-date-range-dropdown", ["value", "id"]) === "custom") {
      const reportDateStart = id("report-date-range-start", ["value"]);
      const reportDateStop = id("report-date-range-stop", ["value"]);
      if (!reportDateStart || !reportDateStop || reportDateStart > reportDateStop) {
        return true;
      }
    } else if (!id("report-date-range-dropdown", ["value", "id"])) {
      return true;
    }
  
    if (id("dimension-dropdown", ["value", "length"]) === 0) {
      return true;
    }
  
    if (id("metrics-dropdown", ["value", "length"]) === 0) {
      return true;
    }
  
    // Check for Delivery Method and Delivery Frequency
    const deliveryMethod = id("delivery-method-dropdown", ["value", "id"]);
    const deliveryFrequency = id("delivery-frequency-dropdown", ["value", "id"]);
  
    // If both Delivery Method and Delivery Frequency are not selected yet, return true to disable the Create option
    if (!deliveryMethod || !deliveryFrequency) {
      return true;
    }
    return false;
  };
      return html`
        <div class="columns col-spacing">
          <div class="column is-half">
            <p class="mb-2 ml-2">* Report type</p>
            <bulma-dropdown
              id="template-dropdown"
              hasObjectValues
              nameProperty="name"
              ,
              idProperty="id"
              ,
              .options=${this.templates}
              .value=${this.template}
              @change=${(e) => {
                this.template = e.detail.value;
                this.dimensionList = [];
                this.metricList = [];
                this.getDimensionMetricFields();
                this.resetForm();
              }}
            ></bulma-dropdown>
          </div>
          <div class="column is-half">
            <p class="mb-2 ml-2">* Report permission</p>
            <div class="control">
              <label class="radio"
                ><input
                  id="btnRadio1"
                  type="radio"
                  name="permission"
                  value="public"
                  ?checked=${this.isSwitchPublic}
                  @click=${this.checkRptPermission}
                />
                Public</label
              >
              <label class="radio"
                ><input
                  id="btnRadio2"
                  type="radio"
                  name="permission"
                  value="private"
                  ?checked=${!this.isSwitchPublic}
                  @click=${this.checkRptPermission}
                />
                Private</label
              >
            </div>
          </div>
        </div>
  
        <div class="columns col-spacing">
          <div class="column is-half">
            <p class="mb-2 ml-2">* Report name</p>
            <input
              class="input"
              type="text"
              id="name-input"
              placeholder="Report name"
              @input="${debounce(() => this.checkForReportNames(), INPUT_DEBOUNCE_TIMER)}"
              style=${this.isDuplicateReportName || this.reportNameError
                ? 'border:1px solid var(--color-melon) !important;'
                : ''}
            />
            ${this.reportNameError
              ? html`
                  <div class="is-flex" style="gap:8px !important;">
                    <img
                      src="./images/icon-error.svg"
                      class="mt-2 ml-4 icon-subscription"
                      style="height: 16px !important;"
                    />
                    <span class="has-text-black is-size-6" style="padding-top:6px !important;">
                    specify a report name
                    </span>
                  </div>
                `
              : ''}
            ${this.isDuplicateReportName
              ? html`
                  <div class="is-flex" style="gap:8px !important;">
                    <img
                      src="./images/icon-error.svg"
                      class="mt-2 ml-4 icon-subscription"
                      style="height: 16px !important;"
                    />
                    <span class="has-text-black is-size-6" style="padding-top:6px !important;"
                      >This report name already exists. Please enter a different name.</span
                    >
                  </div>
                `
              : ''}
          </div>
          <div class="column is-half">
            <p class="is-pulled-right">
              ${id('report-date-range-dropdown', ['value', 'example'], []).join(' – ')}
            </p>
            <p class="mb-2 ml-2">
              * Data pull date range
              ${this.template?.name === 'Facebook Audience Intelligence' ? ' - Lifetime' : ''}
            </p>
            <bulma-dropdown
              id="report-date-range-dropdown"
              class=${this.template?.name === 'Facebook Audience Intelligence' ? 'is-disabled' : ''}
              hasObjectValues
              isDisabled
              placeholder="Select data range"
              idProperty="id"
              nameProperty="label"
              .options=${this.template?.name === 'Facebook Audience Intelligence'
                ? ''
                : this.dateCalcs}
              @change=${() => this.requestUpdate()}
              .disableIcon=${this.template?.name === 'Facebook Audience Intelligence' ? true : false}
            ></bulma-dropdown>
  
            <div
              style="${id('report-date-range-dropdown', ['value', 'id']) === 'custom'
                ? ''
                : 'display: none'}"
            >
              <p>&nbsp;</p>
              <lit-flatpickr
                altInput
                altFormat="m/d/Y"
                dateFormat="Y-m-d"
                theme="light"
                maxDate=${this.maxDate}
              >
                <div>
                  <input
                    class="input narrow-input"
                    type="date"
                    placeholder="mm/dd/yyyy"
                    id="report-date-range-start"
                  />
                </div>
              </lit-flatpickr>
              <lit-flatpickr
                altInput
                altFormat="m/d/Y"
                dateFormat="Y-m-d"
                theme="light"
                maxDate=${this.maxDate}
              >
                <div>
                  <input
                    class="input narrow-input"
                    type="date"
                    placeholder="mm/dd/yyyy"
                    id="report-date-range-stop"
                  />
                </div>
              </lit-flatpickr>
            </div>
          </div>
        </div>
  
        <div class="columns col-spacing">
          <div class="column is-half">
            <p class="mb-2 ml-2">
              * Dimensions (${id('dimension-dropdown', ['value', 'length'], 0)})
            </p>
            <bulma-dropdown
              id="dimension-dropdown"
              hasObjectValues
              placeholder="Select dimensions"
              idProperty="column"
              nameProperty="label"
              .options=${this.dimensionList}
              @change=${() => this.requestUpdate()}
              isMulti
            ></bulma-dropdown>
          </div>
          <div class="column is-half">
            <p class="mb-2 ml-2">* Metrics (${id('metrics-dropdown', ['value', 'length'], 0)})</p>
            <bulma-dropdown
              id="metrics-dropdown"
              isMulti
              placeholder="Select filters"
              hasObjectValues
              idProperty="column"
              nameProperty="label"
              @change=${() => this.requestUpdate()}
              .options=${this.metricList}
            ></bulma-dropdown>
          </div>
        </div>
        <p class="is-size-4 mb-16 has-text-weight-bold has-text-dark">Add filters (optional)</p>
        <div class="columns col-spacing">
          <div class="column is-full">
            <p class="mb-2 ml-2">Filters (${this.filters.length})</p>
            <div class="columns">
              ${this.filters.length === 0
                ? html` <div id="addIconTooltip" class="column is-full">
                    <omni-tooltip>
                      <button
                        slot="invoker"
                        class="button is-size-5 is-outlined is-text mt-1"
                        style="width: 43px !important; height: 36px !important;"
                        @click=${addNewFilter}
                      >
                        <omni-icon
                          id="addIcon"
                          class="is-size-2 is-clickable is-normal"
                          icon-id="omni:interactive:add"
                        ></omni-icon>
                      </button>
                      <div slot="content" role="tooltip">
                        Add filters to your report visualization
                      </div>
                    </omni-tooltip>
                  </div>`
                : html` <div class="column is-full">
                    ${this.filters.map(
                      (filter, index) => html`
                        <div class="columns is-vcentered mb-0">
                          <div class="column is-two-fifth">
                            <bulma-dropdown
                              id="filter-column-${filter.id}"
                              hasObjectValues
                              placeholder="Add filters"
                              nameProperty="label"
                              ,
                              idProperty="column"
                              ,
                              .options=${this.dimensionList.filter((d) => d.filterable)}
                              @change=${(e) => {
                                filter.dimension = e.detail.value;
                                filter.column = e.detail.value?.column;
                                this.loadFilterValues(filter);
                                this.requestUpdate();
                              }}
                            >
                            </bulma-dropdown>
                          </div>
                          <div class="column ${filter.values.loading ? 'skeleton' : ''} is-two-fifth">
                            ${filter.values.length === 0
                              ? html` <input
                                  class="input"
                                  type="text"
                                  id="filter-value-${filter.id}"
                                  value=${filter.value || ''}
                                  @change=${() => {
                                    filter.value = id(`filter-value-${filter.id}`, ['value']);
                                    this.requestUpdate();
                                  }}
                                />`
                              : html` <bulma-dropdown
                                  id="filter-value-${filter.id}"
                                  style="max-width: 290px;"
                                  hasSearch
                                  placeholder="Add value"
                                  .asyncSearch=${async (search) =>
                                    this.listColumnValues(
                                      filter.dimension.table,
                                      filter.dimension.column,
                                      search
                                    )}
                                  .options=${filter.values}
                                  @change=${(e) => {
                                    filter.value = e.detail.value;
                                    this.requestUpdate();
                                  }}
                                ></bulma-dropdown>`}
                          </div>
                          <div class="column is-narrow">
                            <omni-tooltip>
                              <button
                                slot="invoker"
                                class="button no-border-background is-shadowless is-text"
                                @click=${() => {
                                  this.filters.splice(index, 1);
                                  this.requestUpdate();
                                }}
                              >
                                <omni-icon
                                  class="is-size-2 is-clickable"
                                  icon-id="omni:interactive:remove"
                                ></omni-icon>
                              </button>
                              <div slot="content">
                                <p style="color: #FFFFFF">Remove Filter</p>
                              </div>
                            </omni-tooltip>
                          </div>
                          <div id="btnAddIcon${index}" class="column is-narrow">
                            <omni-tooltip style="width: 43px">
                              <button
                                slot="invoker"
                                class="button is-size-5 is-outlined is-text mt-1 ${index ===
                                this.filters.length - 1
                                  ? ''
                                  : 'is-hidden'}"
                                style="width: 43px !important; height: 36px !important;"
                                @click=${addNewFilter}
                              >
                                <omni-icon
                                  id="addIcon"
                                  class="is-size-2 is-clickable is-normal"
                                  icon-id="omni:interactive:add"
                                ></omni-icon>
                              </button>
                              <div slot="content" role="tooltip">
                                Add filters to your report visualization
                              </div>
                            </omni-tooltip>
                          </div>
                        </div>
                      `
                    )}
                  </div>`}
            </div>
          </div>
        </div>
        <p class="is-size-4 mb-16 has-text-weight-bold has-text-dark">Set the delivery schedule</p>
        <div class="columns col-spacing">
  
          <div class="column is-one-third">
            <p class="mb-2 ml-2">* Delivery frequency</p>
            <bulma-dropdown
              id="delivery-frequency-dropdown"
              hasObjectValues
              placeholder="Select frequency"
              nameProperty="label"
              ,
              idProperty="id"
              ,
              .options=${this.deliveryFrequencyTypes}
            >
            </bulma-dropdown>
          </div>
  
          <div class="column is-one-third">
            <p class="mb-2 ml-2">* Delivery method</p>
            <bulma-dropdown
              id="delivery-method-dropdown"
              hasObjectValues
              placeholder="Select method"
              nameProperty="label"
              ,
              idProperty="id"
              ,
              .options=${this.deliveryMethodTypes}
              @change=${() => this.requestUpdate()}
            >
            </bulma-dropdown>
          </div>
  
          <div class="column is-one-third">
            <p class="mb-2 ml-2">* Delivery end date</p>
            <div class="is-fullwidth">
              <input
                class="input"
                type="date"
                max="2999-12-31"
                placeholder="yyyy-mm-dd"
                id="delivery-date-range-stop"
                value="${new Date().toISOString().split('T')[0]}"
              />
            </div>
          </div>
        </div>
        <div class="columns col-spacing">
          <div class="column">
            <p class="is-size-4 mb-16 has-text-weight-bold has-text-dark">Choose Image (optional)</p>
            <omni-img-input
              previewable
              class="${this.loading ? 'skeleton' : ''}"
              .filename=${checkFileName(this.value)}
              .previewSrc=${this.value}
              @change=${this._setImage}
            >
              <p slot="placeholder"></p>
              <p slot="help">Max size 1MB (16:9)</p>
            </omni-img-input>
          </div>
        </div>
        <label class="checkbox">
          <input type="checkbox" id="sendmail" />
          Notify me by email
        </label>
  
        <div class="${id('delivery-method-dropdown', ['value', 'id']) === 's3' ? '' : 'is-hidden'}">
          <p>
            S3 bucket name
            <omni-icon
              class="is-size-3 is-clickable is-inline-block"
              icon-id="omni:informative:help"
              title="Help"
              style="vertical-align: middle; fill: var(--color-electric-blue);"
              @click=${() =>
                omnialert(
                  `Providing your own S3 bucket for report delivery requires that the bucket name start with "${this.s3prefix}". The suffix of the S3 bucket name is your choice. Once you create your S3 bucket with this naming convention, you will need to add permissions in the Amazon S3 console to allow for reports to be saved there. The necessary permissioning policy is provided for easy copying.`,
                  'info'
                )}
            ></omni-icon>
          </p>
  
          <div class="columns is-vcentered">
            <div class="column is-narrow">
              <div class="is-fullwidth is-family-code is-size-5">${this.s3prefix}</div>
            </div>
            <div class="column">
              <input
                class="input is-family-code"
                style="vertical-align: unset"
                id="s3-bucket-name"
                @keyup=${() => this.requestUpdate()}
                @change=${() => this.requestUpdate()}
              />
            </div>
          </div>
  
          <div class="columns">
            <div class="column is-fullwidth">
              <p>S3 bucket permission policy</p>
              <textarea
                rows="20"
                class="textarea has-fixed-size is-fullwidth is-family-code is-small has-background-light mb-5"
                readonly
              >
  {
      "Version": "2012-10-17",
      "Statement": [
          {
              "Effect": "Allow",
              "Principal": {
                  "AWS": "arn:aws:iam::732327056170:role/fbspina-lambda-execution-role"
              },
              "Action": [
                  "s3:GetObject",
                  "s3:PutObject",
                  "s3:PutObjectAcl"
              ],
              "Resource": [
                  "${this.s3prefix}${id('s3-bucket-name', ['value'])}/*"
              ]
          }
      ]
  }</textarea
              >
            </div>
          </div>
        </div>
  
        <div class="columns is-flex is-align-items-center is-justify-content-space-between mt-6 mb-2">
          <span class="has-text-grey-light is-size-6 pl-3">* Required fields</span>
          <div class="buttons are-medium is-right">
            <button
              @click=${() => {
                this.dispatchEvent(new Event('close'));
              }}
              class="button is-size-5 is-text"
            >
              Cancel
            </button>
            <button
            @click=${this.save}
            class="button is-size-5 is-link"
            style="background-image: linear-gradient(161deg, #00a1d2 11%, #03bbf3 88%) !important;"
            ?disabled=${hasValidationErrors()} 
            >
              Create
            </button>
          </div>
        </div>
      `;
    }
  
    render() {
      return html`
        ${this.template
          ? html` <omni-style>
          <div class="modal is-active">
            <div class="modal-background"></div>
              <div class="modal-card ${
                this.template && this.dateCalcs && !this.saving ? '' : 'skeleton'
              }">
                <header class="modal-card-head header-separator">
                  <p class="modal-card-title" style="color: var(--color-almost-black);">Create a report</p>
                </header>
                <section class="modal-card-body">
                  ${this.renderModalBody()}
                </section>
              </div>
            </div>
          </div>
        </omni-style> `
          : ''}
      `;
    }
  }
  
  customElements.define('create-report', CreateReport);
  