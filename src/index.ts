import { Platform, Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Buffer } from "buffer";

const MIXPANEL_API_URL = "https://api.mixpanel.com";

export class ExpoMixpanelAnalytics {
  ready = false;
  token: string;
  storageKey: string;
  userId?: string | null;
  clientId?: string;
  platform?: string;
  model?: string;
  queue: any[] = [];
  constants: { [key: string]: string | number | void } = {};
  timers: { [key: string]: number } = {};
  superProps: any = {};

  constructor(token, storageKey = "mixpanel:super:props") {
    this.storageKey = storageKey;

    this.token = token;
    this.userId = null;
    this.clientId = Constants.deviceId || Constants.installationId;
    this.constants = {
      app_build_number: Constants.manifest?.revisionId,
      app_id: Constants.manifest?.slug,
      app_name: Constants.manifest?.name,
      app_version_string: Constants.manifest?.version,
      device_name: Constants.deviceName,
      expo_app_ownership: Constants.appOwnership || undefined,
      os_version: Platform.Version,
    };
    this.timers = {};

    Constants.getWebViewUserAgentAsync().then((userAgent) => {
      // @ts-ignore
      const { width, height } = Dimensions.get("window");
      Object.assign(this.constants, {
        screen_height: height,
        screen_size: `${width}x${height}`,
        screen_width: width,
        user_agent: userAgent,
      });
      if (
        Platform.OS === "ios" &&
        Constants.platform &&
        Constants.platform.ios
      ) {
        this.platform = Constants.platform.ios.platform;
        this.model = Constants.platform.ios.model;
      } else {
        this.platform = "android";
      }

      AsyncStorage.getItem(this.storageKey, (_, result) => {
        if (result) {
          try {
            this.superProps = JSON.parse(result) || {};
          } catch {}
        }

        this.ready = true;
        this._flush();
      });
    });
  }

  register(props: any) {
    this.superProps = props;
    try {
      AsyncStorage.setItem(this.storageKey, JSON.stringify(props));
    } catch {}
  }

  track(name: string, props: any = {}) {
    const startTimestamp = this._removeEventTimer(name);
    if (startTimestamp) {
      const durationInMs = new Date().getTime() - startTimestamp;
      props["$duration"] = parseFloat((durationInMs / 1000).toFixed(3));
    }

    this.queue.push({
      name,
      props,
    });
    this._flush();
  }

  identify(userId?: string) {
    this.userId = userId;
  }

  reset() {
    this.identify(this.clientId);
    try {
      AsyncStorage.setItem(this.storageKey, JSON.stringify({}));
    } catch {}
  }

  people_set(props) {
    this._people("set", props);
  }

  people_set_once(props) {
    this._people("set_once", props);
  }

  people_unset(props) {
    this._people("unset", props);
  }

  people_increment(props) {
    this._people("add", props);
  }

  people_append(props) {
    this._people("append", props);
  }

  people_union(props) {
    this._people("union", props);
  }

  people_delete_user() {
    this._people("delete", "");
  }

  time_event(name: string) {
    this.timers[name] = new Date().getTime();
  }

  // ===========================================================================================

  _flush() {
    if (this.ready) {
      while (this.queue.length) {
        const event = this.queue.pop();
        this._pushEvent(event).then(() => (event.sent = true));
      }
    }
  }

  _people(operation, props) {
    if (this.userId) {
      const data = {
        $token: this.token,
        $distinct_id: this.userId,
      };
      data[`$${operation}`] = props;

      this._pushProfile(data);
    }
  }

  _removeEventTimer(name) {
    const timestamp = this.timers[name];
    if (timestamp) {
      delete this.timers[name];
    }
    return timestamp;
  }

  _pushEvent(event) {
    let data = {
      event: event.name,
      properties: {
        ...this.constants,
        ...(event.props || {}),
        ...this.superProps,
      },
    };
    if (this.userId) {
      data.properties.distinct_id = this.userId;
    }
    data.properties.token = this.token;
    data.properties.client_id = this.clientId;
    if (this.platform) {
      data.properties.platform = this.platform;
    }
    if (this.model) {
      data.properties.model = this.model;
    }

    const buffer = new Buffer(JSON.stringify(data)).toString("base64");

    return fetch(`${MIXPANEL_API_URL}/track/?data=${buffer}`);
  }

  _pushProfile(data) {
    data = new Buffer(JSON.stringify(data)).toString("base64");
    return fetch(`${MIXPANEL_API_URL}/engage/?data=${data}`);
  }
}

export default ExpoMixpanelAnalytics;
