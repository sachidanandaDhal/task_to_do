import {
    OmniElement,
    OmniStyleElement,
    OmniIconElement,
    html,
    css,
    ImageAPI,
    OmniImageInputElement,
    OmniSwitchElement,
    OmniTooltipElement,
  } from 'omni-ui';
  import { ssofetch } from './sso';
  import './bulma-dropdown';
  import { omnialert } from './alert';
  import { checkForCreatedReportNames } from './subscription-service';
  import { debounce } from './portal-utils.js';
  import { getSessionInfo } from './utility.js';
  import { getEnv } from './image-utility';
  import {
    DEFAULT_IMAGE_URL,
    IMAGE_SIZE_ERROR,
    IMAGE_UNAUTHORIZED,
    INVALID_IMAGE,
  } from './constants.js';
  import * as error from './messages.js';
  import { Router } from './web_modules/@vaadin/router.js';
  
  /* eslint no-param-reassign: ["error", { "props": false }] */
  const INPUT_DEBOUNCE_TIMER = 250;
  OmniStyleElement.register();
  OmniIconElement.register();
  OmniImageInputElement.register();
  OmniSwitchElement.register();
  OmniTooltipElement.register();
  
  export default class EditReport extends OmniElement {
    constructor() {
      super();
      this.isDuplicateReportName = false;
      this.session = getSessionInfo();
      this.env = getEnv();
      this.loading = false;
      this.imgPending = '';
      this.deleteReportImg = false;
      this.reportFile = '';
      this.defaultUrl = DEFAULT_IMAGE_URL;
      this.value = '';
      this.deliveryEndDate = false;
      this.isDeliveryEndDateError = false;
    }
  
    static get properties() {
      return {
        report: { attribute: false },
        deleteReportImg: { attribute: false },
        reportFile: { attribute: false },
        saving: { attribute: false },
        isDuplicateReportName: { attribute: false },
        session: { attribute: false },
        env: { type: String },
        loading: { type: Boolean },
        imgPending: { type: String },
        mode: { type: Boolean },
        deliveryEndDate: { attribute: false },
        isDeliveryEndDateError: { attribute: false },
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
          .omni .input,
          .omni .select select,
          bulma-dropdown {
            background-color: #f2f5fa !important;
            border: 1px solid #edf0f5 !important;
          }
          .omni .input,
          .omni .select select {
            height: 36px !important;
            color: var(--color-almost-black) !important;
            padding-left: 1.25em !important;
          }
          .omni .input:focus {
            background-color: #ffffff !important;
            border: 1px solid #0OA1D2 !important;
            box-shadow: rgb(0, 161, 210) 0px 0px 0px 1px !important;
          }
          .omni .select select:focus {
            outline: none;
            background-color: #ffffff !important;
            border: 1px solid #0OA1D2 !important;
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
          /* Without this, long names can force this component to overflow horizontally */
          omni-img-input::part(filename) {
            overflow-wrap: anywhere !important;
          }
          .disabled-permission {
            opacity: 0.45;
            pointer-events: none;
          }
          .tooltip {
            position: relative;
          }
          .tooltip .tooltiptext {
            box-sizing: border-box;
            min-width: 2em;
            min-height: 2em;
            max-width: 40em;
            max-height: 40em;
            animation: 850ms linear 1 fade-in;
            background: linear-gradient(to bottom, #2b3952, #142033 100%);
            border-radius: 8px;
            color: white;
            padding: 7px 15px;
            font-size: 12px;
            font-weight: 600;
            text-align: left;
            pointer-events: none;
            overflow-wrap: break-word;
            visibility: hidden;
            width: auto;
            text-align: center;
            position: absolute;
            z-index: 1;
            top: 120%;
            left: 29%;
            margin-left: -65px;
          }
          .tooltip .tooltiptext::after {
            content: ' ';
            position: absolute;
            bottom: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: transparent transparent black transparent;
          }
          .tooltip:hover .tooltiptext {
            visibility: visible;
          }
        `,
      ];
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
      try {
        await this.saveImpl();
      } finally {
        this.saving = false;
      }
    }
  
    async saveImpl() {
      const id = (...args) => this.getElementById(...args);
      const name = id('name-input', ['value'], '');
      const deliveryDateStop = id('delivery-date-range-stop', ['value']);
      const reportStatus = id('status-dropdown', ['value']);
      const reportStatusMessage = id('status-message-input', ['value'], '');
      const sendmail = id('sendmail', ['checked']);
      const destination = { sendmail };
      const update_date = new Date().toISOString().split('T')[0];
      const updated_by = this.session.user_id;
      if (name === '') {
        return omnialert(error.ERROR_REPORT_NAME);
      }
      if (name.match(/^\s*$/)) {
        return omnialert(error.ERROR_REPORT_NAME_WHITESPACE);
      }
      if (!deliveryDateStop) {
        return omnialert(error.ERROR_SPECIFY_DELIVERY_END);
      }
      if (
        new Date().toISOString().split('T')[0] > deliveryDateStop &&
        deliveryDateStop !== this.report?.end_date
      ) {
        return omnialert(error.ERROR_DELIVERY_SCHEDULE);
      }
      if (this.imgPending) {
        return omnialert(this.imgPending);
      }
      let data = {
        name,
        end_date: deliveryDateStop,
        status: reportStatus,
        status_message: reportStatusMessage,
        destination,
        update_date,
        updated_by,
        is_public: this.shadowRoot?.getElementById('btnRadio1').checked ? true : false,
      };
      if (this.value) {
        data.image_url = this.value;
      }
      if (!this.isDuplicateReportName) {
        const response = await ssofetch(`/scheduler/reports/${this.report?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await response.json();
        if (json.success) {
          Router.go('/reports');
          this.dispatchEvent(new Event('refresh'));
          this.dispatchEvent(new Event('close'));
        } else {
          if (this.deliveryEndDate) {
            this.report.status = 'FINISHED';
          }
          omnialert(`Report edit failed: ${json.error}`);
        }
      }
      return null;
    }
  
    // async checkForReportNames() {
    //   const reportName = this.shadowRoot.getElementById('name-input')?.value;
    //   if (reportName) {
    //     const result = await checkForCreatedReportNames(reportName.trim());
    //     const itemsWithoutCurrent = result?.reportTypeDetails?.filter((x) => {
    //       return x.name.toLowerCase() !== this.report?.name.toLowerCase();
    //     });
    //     this.isDuplicateReportName = itemsWithoutCurrent?.length > 0 ? true : false;
    //   } else {
    //     this.isDuplicateReportName = false;
    //   }
    //   this.requestUpdate();
    // }
  
    async checkForReportNames() {
      const reportName = this.shadowRoot.getElementById('name-input')?.value;
      if (reportName) {
        const result = await checkForCreatedReportNames(reportName.trim());
        const itemsWithoutCurrent = result?.reportTypeDetails?.filter((x) => {
          return x.name.toLowerCase() !== this.report?.name.toLowerCase();
        });
        this.isDuplicateReportName = itemsWithoutCurrent?.length > 0 ? true : false;
  
        // Check if the user tries to edit the name to be the same as the existing name.
        this.isSameReportName = reportName.toLowerCase() === this.report?.name.toLowerCase();
        this.isEmptyField = false; // Reset the empty field flag since there is an input now.
      } else {
        this.isDuplicateReportName = false;
        this.isSameReportName = false;
        this.isEmptyField = true; // Set the empty field flag to true.
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
      this.reportFile = file;
      if (file === null) {
        this.value = this.defaultUrl;
        this._setURL(this.defaultUrl);
      } else {
        if (!file.name.match(/.(jpg|jpeg|png|gif)$/i)) {
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
    }
  
    shouldUpdate(changedProperties) {
      if (changedProperties.has('report')) {
        this.value = this.report?.image_url;
        this.mode = this.report?.is_public;
      }
      return true;
    }
  
    checkRptPermission() {
      const elem1 = this.shadowRoot?.getElementById('btnRadio1');
      const elem2 = this.shadowRoot?.getElementById('btnRadio2');
      if (elem1.checked) {
        elem2.checked = false;
        this.mode = true;
      } else {
        elem2.checked = true;
        this.mode = false;
      }
      this.requestUpdate();
    }
  
    async deleteImage() {
      this.deleteReportImg = !this.deleteReportImg;
      this.value = this.defaultUrl;
      this._setURL(this.defaultUrl);
    }
  
    handleChangeDate() {
      const id = (...args) => this.getElementById(...args);
      const deliveryDateStop = id('delivery-date-range-stop', ['value']);
      if (
        new Date().toISOString().split('T')[0] > deliveryDateStop &&
        deliveryDateStop !== this.report?.end_date
      ) {
        this.report.status = 'FINISHED';
        this.isDeliveryEndDateError = true;
        this.requestUpdate();
        return false;
      } else {
        this.isDeliveryEndDateError = false;
      }
      if (this.report?.status === 'FINISHED') {
        this.report.status = 'ENABLED';
        this.deliveryEndDate = true;
        this.requestUpdate();
      }
    }
  
    handleChangeStatus(status) {
      const id = (...args) => this.getElementById(...args);
      const deliveryDateStop = id('delivery-date-range-stop', ['value']);
      if (
        new Date().toISOString().split('T')[0] > deliveryDateStop &&
        status === 'ENABLED' &&
        this.report?.is_subscribed
      ) {
        this.isDeliveryEndDateError = true;
      }
    }
  
    getInlineError(message) {
      return html`
        <div class="is-flex" style="gap:8px !important;">
          <img
            src="./images/icon-error.svg"
            class="mt-2 ml-4 icon-subscription"
            style="height: 16px !important;"
          />
          <span class="has-text-black is-size-6" style="padding-top:6px !important;">${message}</span>
        </div>
      `;
    }
  
    renderModalBody() {
      return html`
        <div class="columns col-spacing">
          <!-- <div class="column is-half pr-5">
            <p class="mb-2 ml-2">Report name</p>
            <input
              class="input"
              type="text"
              id="name-input"
              value=${this.report?.name}
              @input="${debounce(() => this.checkForReportNames(), INPUT_DEBOUNCE_TIMER)}"
              style=${this.isDuplicateReportName
            ? 'border:1px solid var(--color-melon) !important;'
            : ''}
            />
            ${this.isDuplicateReportName ? this.getInlineError(error.ERROR_REPORT_ALREADY_EXIST) : ''}
          </div> -->
          <div class="column is-half pr-5">
            <p class="mb-2 ml-2">Report name</p>
            <input
              class="input"
              type="text"
              id="name-input"
              value=${this.report?.name}
              @input="${debounce(() => this.checkForReportNames(), INPUT_DEBOUNCE_TIMER)}"
              style=${this.isDuplicateReportName || this.isSameReportName
                ? 'border:1px solid var(--color-melon) !important;'
                : this.isEmptyField
                ? 'border:1px solid red !important;'
                : ''}
            />
            ${this.isDuplicateReportName ? this.getInlineError(error.ERROR_REPORT_ALREADY_EXIST) : ''}
            ${this.isSameReportName
              ? this.getInlineError('Report name cannot be the same as the existing name.')
              : ''}
            ${this.isEmptyField ? this.getInlineError('Report name cannot be empty.') : ''}
          </div>
  
  
          <div class="column is-half pl-5">
            <p class="mb-2 ml-2">Delivery end date</p>
            <div class="is-fullwidth">
              <div class="tooltip">
                <input
                  type="date"
                  slot="invoker"
                  class="input ${!this.report?.is_subscribed ? 'disabled-permission' : ''}"
                  placeholder="yyyy-mm-dd"
                  max="2999-12-31"
                  id="delivery-date-range-stop"
                  value=${this.report?.end_date}
                  @change=${(e) => this.handleChangeDate()}
                  style=${this.isDeliveryEndDateError
                    ? 'border:1px solid var(--color-melon) !important;'
                    : ''}
                />
                ${this.isDeliveryEndDateError
                  ? this.getInlineError(error.ERROR_DELIVERY_END_DATE)
                  : ''}
                ${!this.report?.is_subscribed
                  ? html`<span class="tooltiptext">${error.NOT_SUBSCRIBED_MESSAGE}</span>`
                  : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="columns col-spacing">
          <div class="column is-half pr-5">
            <p class="mb-2 ml-2">Report status</p>
            <bulma-dropdown
              id="status-dropdown"
              .options=${['ENABLED', 'FINISHED', 'DISABLED', 'UNHEALTHY']}
              .value=${this.report?.status}
              @change=${(e) => this.handleChangeStatus(e.target.value)}
            ></bulma-dropdown>
          </div>
          <div class="column is-half pl-5">
            <p class="mb-2 ml-2">Report status message</p>
            <div class="is-fullwidth">
              <input
                class="input"
                type="text"
                id="status-message-input"
                value="${this.report?.status_message}"
              />
            </div>
          </div>
        </div>
        <div class="columns col-spacing">
          <div class="column is-half pr-5">
            <p class="mb-2 ml-2">Report permission</p>
            <div
              class="control ${this.session.admin
                ? ''
                : this.report?.user.id.toLowerCase() === this.session.user_id.toLowerCase()
                ? ''
                : 'disabled-permission'}"
            >
              <label class="radio"
                ><input
                  id="btnRadio1"
                  type="radio"
                  name="permission"
                  value="public"
                  ?checked=${this.mode ? true : false}
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
                  ?checked=${!this.mode ? true : false}
                  @click=${this.checkRptPermission}
                />
                Private</label
              >
            </div>
          </div>
        </div>
        <div class="columns col-spacing">
          <div class="column">
            <p class="is-size-4 mb-16 has-text-weight-bold has-text-dark">Choose Image (optional)</p>
            <omni-img-input
              previewable
              class="${this.loading ? 'skeleton' : ''}"
              .previewSrc=${this.value}
              @change=${this._setImage}
            >
              <p slot="placeholder"></p>
              <p slot="help">Max size 1MB (16:9)</p>
            </omni-img-input>
            ${!this.reportFile?.name
              ? html`<button slot="invoker" class="button is-text" @click=${() => this.deleteImage()}>
                  <omni-icon
                    id="close-search-icon"
                    class="is-size-1 input-action-icon"
                    icon-id="omni:interactive:close"
                  >
                  </omni-icon>
                </button>`
              : ''}
          </div>
        </div>
        <div class="columns col-spacing">
          <div class="column is-one-third">
            <label class="checkbox">
              <input type="checkbox" id="sendmail" ?checked=${this.report?.destination.sendmail} />
              Notify me by email
            </label>
          </div>
        </div>
        <div class="buttons are-medium is-right">
          <button @click=${() => this.close()} class="button is-size-5 is-text">Cancel</button>
          <button
            @click=${this.save}
            ?disabled=${this.isDeliveryEndDateError || this.isDuplicateReportName || this.isEmptyField || this.isSameReportName }
            class="button is-size-5 is-link"
            style="background-image: linear-gradient(161deg, #00a1d2 11%, #03bbf3 88%) !important;"
          >
            Save
          </button>
        </div>
      `;
    }
  
    close() {
      this.dispatchEvent(new Event('close'));
      if (this.deliveryEndDate) {
        this.report.status = 'FINISHED';
      }
      Router.go('/reports');
    }
  
    checkPermission() {
      if (!window.isAdmin) {
        if (this.report?.user.id === window.user_id) {
          return true;
        } else {
          return false;
        }
      }
      return true;
    }
  
    renderNoPermission() {
      if (window.location.href.includes('edit')) {
        omnialert(error.ERROR_EDIT_REPORT_ACCESS);
      } else {
        omnialert(`${error.ERROR_NOT_AUTHORIZED_REPORT} ${this.report?.name}.`);
      }
    }
  
    render() {
      return html`
        <omni-style>
          ${this.checkPermission()
            ? html` <div class="modal is-active">
                <div class="modal-background"></div>
                <div class="modal-card">
                  <div class="modal-card ${!this.saving ? '' : 'skeleton'}">
                    <header class="modal-card-head header-separator">
                      <p class="modal-card-title">Edit report</p>
                    </header>
                    <section class="modal-card-body">${this.renderModalBody()}</section>
                  </div>
                </div>
              </div>`
            : html`${this.renderNoPermission()}`}
        </omni-style>
      `;
    }
  }
  
  customElements.define('edit-report', EditReport);
  