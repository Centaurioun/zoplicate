import { getString } from "../utils/locale";
import { DialogHelper } from "zotero-plugin-toolkit/dist/helpers/dialog";
import { TagElementProps } from "zotero-plugin-toolkit/dist/tools/ui";
import { Action } from "../utils/action";
import { setPref } from "../utils/prefs";

export class Duplicates {
  constructor() {
    this.dialogData = addon.data.dialogs.dialog?.dialogData || {
      savePreference: false,
      defaultAction: Action.CANCEL,
      resultMessage: undefined,
      loadCallback: () => {
        const defaultActionOptions = this.document?.getElementById(
          `act_${this.dialogData.defaultAction}`,
        ) as HTMLInputElement;
        defaultActionOptions?.click();
      },
      unloadCallback: () => {
        if(this.dialogData.savePreference) {
          setPref("duplicate.default.action", this.dialogData.defaultAction);
        }
        this.dialog = undefined;
        this.duplicateMaps = undefined;
      },
    };
  }

  async showDuplicates(duplicateMaps: Map<number, { existingItemIDs: number[]; action: Action }>) {
    this.updateDuplicateMaps(duplicateMaps);

    if (this.dialog) {
      // const prevScrollWidth = this.document?.body.scrollWidth || 0;
      // const prevScrollHeight = this.document?.body.scrollHeight || 0;
      // If dialog is already opened, update table
      const tableBody = await this.updateTable();
      const prevTableBody = this.document?.getElementById("table_body") as Element;
      ztoolkit.UI.replaceElement(tableBody, prevTableBody);

      this.resumeRadioCheckStatus();

      // const scrollWidth = this.document?.body.scrollWidth || 0;
      // const scrollHeight = this.document?.body.scrollHeight || 0;
      // this.window?.resizeBy(scrollWidth - prevScrollWidth, scrollHeight - prevScrollHeight);
      // TODO: still not perfect, especially in Chinese language
      (this.window as any).sizeToContent();
    } else {
      // If dialog is not opened, create dialog
      this.dialog = await this.createDialog();
      this.dialog.open(getString("du-dialog-title"), {
        centerscreen: true,
        resizable: false,
        fitContent: true,
        noDialogMode: false,
        alwaysRaised: true,
      });
      await this.dialogData.unloadLock.promise;
      addon.data.alive && this.dialogData.resultMessage && ztoolkit.getGlobal("alert")(this.dialogData.resultMessage);
    }
  }

  static processDuplicates(duplicateMaps: Map<number, { existingItemIDs: number[]; action: Action }>) {


    const itemsToTrash: number[] = [];
    const selectedItems: number[] = [];
    if(duplicateMaps.size === 0) return { itemsToTrash, selectedItems };

    const popWin = new ztoolkit.ProgressWindow(
      getString("du-dialog-title"),
      {
        closeOnClick: true
      }).createLine({
        text: getString("du-progress-text"),
        type: "default",
        progress: 0,
      }).show();

    for (const [newItemID, { existingItemIDs, action }] of duplicateMaps) {
      if (action === Action.KEEP) {
        itemsToTrash.push(...existingItemIDs);
        selectedItems.push(newItemID);
      } else if (action === Action.DISCARD) {
        itemsToTrash.push(newItemID);
        selectedItems.push(...existingItemIDs);
      }
    }
    popWin.changeLine({
      text: getString("du-progress-text"),
      type: "default",
      progress: 30,
    });

    if (itemsToTrash.length) {
      Zotero.Items.trashTx(itemsToTrash);
    }
    popWin.changeLine({
      text: getString("du-progress-text"),
      type: "default",
      progress: 80,
    });
    if (selectedItems.length) {
      ZoteroPane.selectItems(selectedItems);
    }

    popWin.changeLine({
      text: getString("du-progress-done"),
      type: "success",
      progress: 100,
    });

    return { itemsToTrash, selectedItems };
  }

  private readonly dialogData: { [key: string | number | symbol]: any };

  private get dialog(): DialogHelper | undefined {
    return addon.data.dialogs.dialog;
  }

  private set dialog(value: DialogHelper | undefined) {
    addon.data.dialogs.dialog = value;
  }

  private get duplicateMaps(): Map<number, { existingItemIDs: number[]; action: Action }> | undefined {
    return addon.data.dialogs.duplicateMaps;
  }

  private set duplicateMaps(value: Map<number, { existingItemIDs: number[]; action: Action }> | undefined) {
    addon.data.dialogs.duplicateMaps = value;
  }

  private get window(): Window | undefined {
    return this.dialog?.window;
  }

  private get document(): Document | undefined {
    return this.window?.document;
  }

  private get newItemIDs(): number[] {
    return Array.from(this.duplicateMaps?.keys() || []);
  }

  private updateDuplicateMaps(duplicateMaps: Map<number, { existingItemIDs: number[]; action: Action }>) {
    if (this.duplicateMaps) {
      duplicateMaps.forEach((value, key) => {
        value.action = this.duplicateMaps?.get(key)?.action || value.action;
        this.duplicateMaps?.set(key, value);
      });
    } else {
      this.duplicateMaps = duplicateMaps;
    }
  }

  private resumeRadioCheckStatus() {
    this.duplicateMaps?.forEach((value, newItemID) => {
      const action = value.action;
      const id = `act_${action}_${newItemID}`;
      const radio = this.document?.getElementById(id) as HTMLInputElement;
      radio.checked = true;
    });
  }

  private async createDialog() {
    const tableBody = await this.updateTable();
    return new ztoolkit.Dialog(3, 1)
      .setDialogData(this.dialogData)
      .addCell(0, 0, { tag: "h2", properties: { innerHTML: getString("du-dialog-header") } })
      .addCell(1, 0, {
        tag: "table",
        id: "data_table",
        namespace: "html",
        attributes: { border: "1" },
        styles: {
          borderCollapse: "collapse",
          textAlign: "center",
          whiteSpace: "nowrap",
        },
        children: [
          {
            tag: "thead",
            namespace: "html",
            children: [
              {
                tag: "tr",
                namespace: "html",
                children: [
                  {
                    tag: "th",
                    namespace: "html",
                    properties: {
                      innerHTML: getString("du-dialog-table-title"),
                    },
                  },
                  this.createTh(Action.KEEP),
                  this.createTh(Action.DISCARD),
                  this.createTh(Action.CANCEL),
                ],
              },
            ],
          },
          tableBody,
        ],
      })
      .addCell(2, 0, {
        tag: "div",
        namespace: "html",
        id: "act_as_default_div",
        styles: {
          padding: "5px",
        },
        children: [
          {
            tag: "input",
            namespace: "html",
            id: "act_as_default",
            attributes: {
              "data-bind": "savePreference",
              "data-prop": "checked",
              type: "checkbox",
            },
          },
          {
            tag: "label",
            namespace: "html",
            attributes: {
              for: "act_as_default",
            },
            properties: { innerHTML: getString("du-dialog-as-default") },
          },
        ],
      })
      .addButton(getString("du-dialog-button-apply"), "btn_process", {
        callback: (e) => {
          const { itemsToTrash, selectedItems } = Duplicates.processDuplicates(this.duplicateMaps!);
          itemsToTrash.length && (this.dialogData.resultMessage = "Has trashed all duplicates.");
        },
      })
      .addButton(getString("du-dialog-button-go-duplicates"), "btn_go_duplicate", {
        callback: (e) => {
          const libraryID = ZoteroPane.getSelectedLibraryID();
          const type = "duplicates";
          const show = true;
          const select = true;
          // https://github.com/zotero/zotero/blob/main/chrome/content/zotero/zoteroPane.js#L1430C21
          ZoteroPane.setVirtual(libraryID, type, show, select);
        },
      })
      .addButton(getString("general-cancel"), "btn_cancel");
  }

  private async updateTable(): Promise<TagElementProps> {
    const tableRows = [];
    for (const [newItemID, { existingItemIDs, action }] of this.duplicateMaps || []) {
      if (existingItemIDs.length === 0) continue;
      const item = await Zotero.Items.getAsync(newItemID);
      const title = item.getField("title");

      tableRows.push({
        tag: "tr",
        namespace: "html",
        children: [
          {
            tag: "td",
            namespace: "html",
            styles: {
              maxWidth: "800px",
              minWidth: "100px",
              padding: "5px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textAlign: "left",
            },
            properties: {
              innerHTML: title,
            },
          },
          this.createRadioTd(newItemID, Action.KEEP),
          this.createRadioTd(newItemID, Action.DISCARD),
          this.createRadioTd(newItemID, Action.CANCEL),
        ],
      });
    }
    return {
      tag: "tbody",
      id: "table_body",
      namespace: "html",
      children: tableRows,
    };
  }

  private updateAction(newItemID: number, action: Action) {
    const value = this.duplicateMaps?.get(newItemID);
    if (value) {
      value.action = action;
      this.duplicateMaps?.set(newItemID, value);
    }
  }

  private createRadioTd(newItemID: number, action: Action): TagElementProps {
    return {
      tag: "td",
      namespace: "html",
      styles: {
        padding: "5px",
      },
      children: [
        {
          tag: "input",
          namespace: "html",
          id: `act_${action}_${newItemID}`,
          attributes: {
            type: "radio",
            name: `action_${newItemID}`,
          },
          listeners: [
            {
              type: "click",
              listener: () => {
                this.updateAction(newItemID, action);
                const selectAll = Array.from(this.duplicateMaps?.values()!).every((i) => i.action === action);

                // Set disabled status of "as default" checkbox
                const asDefaultDiv = this.document?.getElementById("act_as_default_div");
                asDefaultDiv && (asDefaultDiv.style.visibility = selectAll ? "visible" : "hidden");

                if (selectAll) {
                  // Update default action
                  this.dialog?.dialogData && (this.dialog.dialogData.defaultAction = action);

                  // Set radio of Column Header to checked
                  const id = `act_${action}`;
                  const radio = this.document?.getElementById(id) as HTMLInputElement;
                  radio.checked = true;
                } else {
                  // Set radio of Column Header to unchecked
                  const asDefaultCheckbox = this.document?.getElementById("act_as_default") as HTMLInputElement;
                  asDefaultCheckbox.checked = false;
                  const allRadios = this.document?.getElementsByName("default_action") as NodeListOf<HTMLInputElement>;
                  allRadios &&
                    allRadios.forEach((radio) => {
                      radio.checked = false;
                    });
                }
              },
            },
          ],
        },
      ],
      listeners: [
        {
          type: "click",
          listener: () => {
            // Click the cell to select the radio
            const id = `act_${action}_${newItemID}`;
            const radio = this.document?.getElementById(id) as HTMLInputElement;
            radio.click();
          },
        },
      ],
    };
  }

  private createTh(action: Action): TagElementProps {
    return {
      tag: "th",
      namespace: "html",
      styles: {
        padding: "5px",
        textAlign: "left",
        whiteSpace: "nowrap",
      },
      children: [
        {
          tag: "input",
          namespace: "html",
          id: `act_${action}`,
          attributes: {
            type: "radio",
            name: "default_action",
            value: action,
          },
          listeners: [
            {
              type: "click",
              listener: () => {
                // Set all radio of this action to checked
                this.newItemIDs.forEach((newItemID) => {
                  const id = `act_${action}_${newItemID}`;
                  const radio = this.document?.getElementById(id) as HTMLInputElement;
                  !radio.checked && radio.click();
                });
              },
            },
          ],
        },
        {
          tag: "label",
          namespace: "html",
          attributes: {
            for: `act_${action}`,
          },
          properties: { innerHTML: getString(`du-dialog-table-${action}`) },
        },
      ],
    };
  }
}