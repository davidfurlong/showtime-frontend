/* do not change this file, it is auto generated by storybook. */
import {
  configure,
  addDecorator,
  addParameters,
  addArgsEnhancer,
} from "@storybook/react-native";

import { decorators, parameters } from "./preview";

if (decorators) {
  decorators.forEach((decorator) => addDecorator(decorator));
}

if (parameters) {
  addParameters(parameters);
}

const getStories = () => {
  return [
    require("../../../packages/design-system/accordion/accordion.stories.tsx"),
    require("../../../packages/design-system/avatar/avatar.stories.tsx"),
    require("../../../packages/design-system/bottom-sheet/bottom-sheet.stories.tsx"),
    require("../../../packages/design-system/checkbox/checkbox.stories.tsx"),
    require("../../../packages/design-system/data-pill/data-pill.stories.tsx"),
    require("../../../packages/design-system/fieldset/fieldset.stories.tsx"),
    require("../../../packages/design-system/input/input.stories.tsx"),
    // require("../../../packages/design-system/media/media.stories.tsx"),
    // require("../../../packages/design-system/messages/message-box.stories.tsx"),
    // require("../../../packages/design-system/messages/message-row.stories.tsx"),
    require("../../../packages/design-system/modal-sheet/modal-sheet.stories.tsx"),
    require("../../../packages/design-system/modal/modal.stories.tsx"),
    require("../../../packages/design-system/pressable-scale/pressable-scale.stories.tsx"),
    require("../../../packages/design-system/segmented-control/segmented-control.stories.tsx"),
    require("../../../packages/design-system/select/select.stories.tsx"),
    require("../../../packages/design-system/skeleton/skeleton.stories.tsx"),
    require("../../../packages/design-system/spinner/spinner.stories.tsx"),
    require("../../../packages/design-system/switch/switch.stories.tsx"),
    // require("../../../packages/design-system/tabs/tabs.stories.tsx"),
    require("../../../packages/design-system/text/text.stories.tsx"),
    require("../../../packages/design-system/alert/alert.stories.tsx"),
    require("../../../packages/design-system/toast/toast.stories.tsx"),
    require("../../../packages/design-system/verification-badge/badge.stories.tsx"),
    require("../../../packages/design-system/modal-new/modal.stories"),
  ];
};

configure(getStories, module, false);
