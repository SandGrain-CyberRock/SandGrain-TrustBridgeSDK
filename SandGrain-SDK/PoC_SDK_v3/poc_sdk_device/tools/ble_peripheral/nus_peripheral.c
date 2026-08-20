/* =============================================================================
 * nus_peripheral.c — Milestone 1: standalone BLE NUS peripheral on Linux/BlueZ
 *
 * Purpose: prove the air/GATT layer works against the EXISTING gateway central
 * (poc_sdk_gateway .../port_comm_device_ble.c, gattlib) before any SDK code is
 * involved. This binary makes a Raspberry Pi look, on the air, exactly like the
 * Nordic board:
 *     - advertises the name  "SandGrain-Dev"  + the NUS 128-bit service UUID
 *     - exposes the Nordic UART Service:
 *         TX char 6e400003…  (notify)  device -> gateway
 *         RX char 6e400002…  (write)   gateway -> device
 *     - ECHOES: every byte the gateway writes on RX is notified straight back
 *       on TX. No framing/logic yet — that lands in Milestone 2 (port_comm.c).
 *
 * gattlib (used by the gateway) is central-only, so we cannot host a peripheral
 * with it. Instead we drive BlueZ directly over D-Bus (GLib/GIO):
 *     org.bluez.GattManager1.RegisterApplication   — publish the GATT tree
 *     org.bluez.LEAdvertisingManager1.RegisterAdvertisement — start advertising
 * Notifications are delivered the classic BlueZ way: emit PropertiesChanged on
 * the TX characteristic's "Value" property while Notifying is true.
 *
 * Build:  make            (needs pkg-config gio-2.0, i.e. libglib2.0-dev)
 * Run:    ./nus_peripheral            (uses hci0; needs BlueZ running)
 * Test:   from the gateway Pi, run the existing BLE gateway/central — it should
 *         scan, find SandGrain-Dev, connect, subscribe, and see its writes
 *         echoed back.
 * ============================================================================= */
#include <gio/gio.h>
#include <glib.h>
#include <glib-unix.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>

/* ── BlueZ ── */
#define BLUEZ_BUS_NAME   "org.bluez"
#define ADAPTER_PATH     "/org/bluez/hci0"   /* override with $HCI (e.g. hci1)   */

/* ── Our exported object tree ── */
#define APP_PATH         "/org/sandgrain/app"
#define SERVICE_PATH     "/org/sandgrain/app/service0"
#define CHAR_TX_PATH     "/org/sandgrain/app/service0/char_tx"
#define CHAR_RX_PATH     "/org/sandgrain/app/service0/char_rx"
#define ADV_PATH         "/org/sandgrain/adv0"

/* ── Nordic UART Service UUIDs (must match the board and the gateway central) ─ */
#define NUS_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  /* periph notifies */
#define NUS_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  /* periph is written */

/* Advertised name. Override with env BLE_NAME (e.g. "SandGrain-Dev2") when
 * several devices run against a multi-device gateway. Max 29 bytes. */
#define DEVICE_NAME_DEFAULT "SandGrain-Dev"
static const char *device_name(void)
{
    static char name_buf[30];
    if (!name_buf[0]) {
        const char *n = g_getenv("BLE_NAME");
        snprintf(name_buf, sizeof(name_buf), "%s", (n && *n) ? n : DEVICE_NAME_DEFAULT);
    }
    return name_buf;
}
#define DEVICE_NAME device_name()

#define GATT_CHRC_IFACE  "org.bluez.GattCharacteristic1"
#define GATT_SVC_IFACE   "org.bluez.GattService1"
#define ADV_IFACE        "org.bluez.LEAdvertisement1"
#define OM_IFACE         "org.freedesktop.DBus.ObjectManager"

/* ── Global state ── */
static GMainLoop        *loop;
static GDBusConnection  *conn;
static const char       *adapter_path = ADAPTER_PATH;
static gboolean          tx_notifying = FALSE;
static guint8            tx_value[512];   /* last notified TX payload            */
static gsize             tx_value_len = 0;

static GDBusNodeInfo    *node_info;

/* Advertisement payload bisect toggles (env):
 *   ADV_NO_UUID=1  — omit ServiceUUIDs from the advertisement (gateway matches
 *                    by NAME, so this is a valid permanent configuration)
 *   ADV_NO_NAME=1  — omit LocalName (bisect only; gateway needs the name) */
static gboolean adv_no_uuid;
static gboolean adv_no_name;

/* -------------------------------------------------------------------------- */
/* D-Bus introspection — the interfaces BlueZ expects us to implement.        */
/* The LEAdvertisement1 property list must match what GetAll will return, so   */
/* the optional properties are spliced in at runtime (see %s placeholders).    */
/* -------------------------------------------------------------------------- */
static const char introspection_xml_fmt[] =
    "<node>"
    "  <interface name='org.freedesktop.DBus.ObjectManager'>"
    "    <method name='GetManagedObjects'>"
    "      <arg type='a{oa{sa{sv}}}' name='objects' direction='out'/>"
    "    </method>"
    "  </interface>"
    "  <interface name='org.bluez.GattService1'>"
    "    <property name='UUID' type='s' access='read'/>"
    "    <property name='Primary' type='b' access='read'/>"
    "  </interface>"
    "  <interface name='org.bluez.GattCharacteristic1'>"
    "    <method name='ReadValue'>"
    "      <arg type='a{sv}' name='options' direction='in'/>"
    "      <arg type='ay' name='value' direction='out'/>"
    "    </method>"
    "    <method name='WriteValue'>"
    "      <arg type='ay' name='value' direction='in'/>"
    "      <arg type='a{sv}' name='options' direction='in'/>"
    "    </method>"
    "    <method name='StartNotify'/>"
    "    <method name='StopNotify'/>"
    "    <property name='UUID' type='s' access='read'/>"
    "    <property name='Service' type='o' access='read'/>"
    "    <property name='Flags' type='as' access='read'/>"
    "    <property name='Notifying' type='b' access='read'/>"
    "    <property name='Value' type='ay' access='read'/>"
    "  </interface>"
    "  <interface name='org.bluez.LEAdvertisement1'>"
    "    <method name='Release'/>"
    "    <property name='Type' type='s' access='read'/>"
    "    <property name='Discoverable' type='b' access='read'/>"
    "%s"   /* LocalName    (unless ADV_NO_NAME) */
    "%s"   /* ServiceUUIDs (unless ADV_NO_UUID) */
    "  </interface>"
    "</node>";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/* Build an 'ay' variant from raw bytes. */
static GVariant *bytes_to_ay(const guint8 *data, gsize len)
{
    return g_variant_new_fixed_array(G_VARIANT_TYPE_BYTE, data, len, sizeof(guint8));
}

/* Build the Flags 'as' variant from a NULL-terminated list of strings. */
static GVariant *flags_as(const char *const *flags)
{
    GVariantBuilder b;
    g_variant_builder_init(&b, G_VARIANT_TYPE("as"));
    for (int i = 0; flags[i]; i++)
        g_variant_builder_add(&b, "s", flags[i]);
    return g_variant_builder_end(&b);
}

static const char *const TX_FLAGS[] = { "notify", NULL };
static const char *const RX_FLAGS[] = { "write", "write-without-response", NULL };

/* Deliver a notification to the subscribed central: emit PropertiesChanged on
 * the TX characteristic's "Value" property. BlueZ turns this into an ATT
 * notification while the central has subscribed (Notifying == true). */
static gboolean tx_notify(const guint8 *data, gsize len)
{
    if (!tx_notifying) {
        g_printerr("[TX] not subscribed yet — dropping %zu bytes\n", len);
        return FALSE;
    }
    if (len > sizeof(tx_value))
        len = sizeof(tx_value);
    memcpy(tx_value, data, len);
    tx_value_len = len;

    GVariantBuilder changed;
    g_variant_builder_init(&changed, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&changed, "{sv}", "Value", bytes_to_ay(tx_value, tx_value_len));

    GVariantBuilder invalidated;
    g_variant_builder_init(&invalidated, G_VARIANT_TYPE("as"));

    GError *err = NULL;
    g_dbus_connection_emit_signal(conn, NULL, CHAR_TX_PATH,
                                  "org.freedesktop.DBus.Properties",
                                  "PropertiesChanged",
                                  g_variant_new("(sa{sv}as)", GATT_CHRC_IFACE,
                                                &changed, &invalidated),
                                  &err);
    if (err) {
        g_printerr("[TX] emit PropertiesChanged failed: %s\n", err->message);
        g_error_free(err);
        return FALSE;
    }
    g_print("[TX] notified %zu bytes\n", tx_value_len);
    return TRUE;
}

/* -------------------------------------------------------------------------- */
/* Property getters (shared across all our objects; GIO auto-wires these to    */
/* org.freedesktop.DBus.Properties Get/GetAll).                                */
/* -------------------------------------------------------------------------- */
static GVariant *get_property(GDBusConnection *c, const char *sender,
                              const char *object_path, const char *iface,
                              const char *prop, GError **error, gpointer user_data)
{
    (void)c; (void)sender; (void)error; (void)user_data;

    if (g_strcmp0(object_path, SERVICE_PATH) == 0) {
        if (g_strcmp0(prop, "UUID") == 0)    return g_variant_new_string(NUS_SERVICE_UUID);
        if (g_strcmp0(prop, "Primary") == 0) return g_variant_new_boolean(TRUE);
    } else if (g_strcmp0(object_path, CHAR_TX_PATH) == 0) {
        if (g_strcmp0(prop, "UUID") == 0)      return g_variant_new_string(NUS_TX_UUID);
        if (g_strcmp0(prop, "Service") == 0)   return g_variant_new_object_path(SERVICE_PATH);
        if (g_strcmp0(prop, "Flags") == 0)     return flags_as(TX_FLAGS);
        if (g_strcmp0(prop, "Notifying") == 0) return g_variant_new_boolean(tx_notifying);
        if (g_strcmp0(prop, "Value") == 0)     return bytes_to_ay(tx_value, tx_value_len);
    } else if (g_strcmp0(object_path, CHAR_RX_PATH) == 0) {
        if (g_strcmp0(prop, "UUID") == 0)      return g_variant_new_string(NUS_RX_UUID);
        if (g_strcmp0(prop, "Service") == 0)   return g_variant_new_object_path(SERVICE_PATH);
        if (g_strcmp0(prop, "Flags") == 0)     return flags_as(RX_FLAGS);
        if (g_strcmp0(prop, "Notifying") == 0) return g_variant_new_boolean(FALSE);
        if (g_strcmp0(prop, "Value") == 0)     return bytes_to_ay(NULL, 0);
    } else if (g_strcmp0(object_path, ADV_PATH) == 0) {
        if (g_strcmp0(prop, "Type") == 0)         return g_variant_new_string("peripheral");
        if (g_strcmp0(prop, "Discoverable") == 0) return g_variant_new_boolean(TRUE);
        if (g_strcmp0(prop, "LocalName") == 0)    return g_variant_new_string(DEVICE_NAME);
        if (g_strcmp0(prop, "ServiceUUIDs") == 0) {
            const char *const uuids[] = { NUS_SERVICE_UUID, NULL };
            return flags_as(uuids);
        }
    }
    (void)iface;
    g_set_error(error, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_PROPERTY,
                "No such property %s on %s", prop, object_path);
    return NULL;
}

/* -------------------------------------------------------------------------- */
/* GetManagedObjects — BlueZ reads the whole GATT tree from here on register.  */
/* -------------------------------------------------------------------------- */
static void add_props_service(GVariantBuilder *ifaces)
{
    GVariantBuilder props;
    g_variant_builder_init(&props, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&props, "{sv}", "UUID",    g_variant_new_string(NUS_SERVICE_UUID));
    g_variant_builder_add(&props, "{sv}", "Primary", g_variant_new_boolean(TRUE));
    g_variant_builder_add(ifaces, "{sa{sv}}", GATT_SVC_IFACE, &props);
}

static void add_props_char(GVariantBuilder *ifaces, const char *uuid,
                           const char *const *flags)
{
    GVariantBuilder props;
    g_variant_builder_init(&props, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&props, "{sv}", "UUID",      g_variant_new_string(uuid));
    g_variant_builder_add(&props, "{sv}", "Service",   g_variant_new_object_path(SERVICE_PATH));
    g_variant_builder_add(&props, "{sv}", "Flags",     flags_as(flags));
    g_variant_builder_add(&props, "{sv}", "Notifying", g_variant_new_boolean(FALSE));
    g_variant_builder_add(&props, "{sv}", "Value",     bytes_to_ay(NULL, 0));
    g_variant_builder_add(ifaces, "{sa{sv}}", GATT_CHRC_IFACE, &props);
}

static GVariant *build_managed_objects(void)
{
    GVariantBuilder objects;
    g_variant_builder_init(&objects, G_VARIANT_TYPE("a{oa{sa{sv}}}"));

    /* service0 */
    GVariantBuilder svc_ifaces;
    g_variant_builder_init(&svc_ifaces, G_VARIANT_TYPE("a{sa{sv}}"));
    add_props_service(&svc_ifaces);
    g_variant_builder_add(&objects, "{oa{sa{sv}}}", SERVICE_PATH, &svc_ifaces);

    /* char_tx */
    GVariantBuilder tx_ifaces;
    g_variant_builder_init(&tx_ifaces, G_VARIANT_TYPE("a{sa{sv}}"));
    add_props_char(&tx_ifaces, NUS_TX_UUID, TX_FLAGS);
    g_variant_builder_add(&objects, "{oa{sa{sv}}}", CHAR_TX_PATH, &tx_ifaces);

    /* char_rx */
    GVariantBuilder rx_ifaces;
    g_variant_builder_init(&rx_ifaces, G_VARIANT_TYPE("a{sa{sv}}"));
    add_props_char(&rx_ifaces, NUS_RX_UUID, RX_FLAGS);
    g_variant_builder_add(&objects, "{oa{sa{sv}}}", CHAR_RX_PATH, &rx_ifaces);

    return g_variant_new("(a{oa{sa{sv}}})", &objects);
}

/* -------------------------------------------------------------------------- */
/* Method dispatch                                                            */
/* -------------------------------------------------------------------------- */
static void method_call(GDBusConnection *c, const char *sender,
                        const char *object_path, const char *iface,
                        const char *method, GVariant *params,
                        GDBusMethodInvocation *invocation, gpointer user_data)
{
    (void)c; (void)sender; (void)object_path; (void)user_data;

    /* ObjectManager on the application root. */
    if (g_strcmp0(iface, OM_IFACE) == 0 &&
        g_strcmp0(method, "GetManagedObjects") == 0) {
        g_dbus_method_invocation_return_value(invocation, build_managed_objects());
        return;
    }

    /* GATT characteristic methods. */
    if (g_strcmp0(iface, GATT_CHRC_IFACE) == 0) {
        if (g_strcmp0(method, "WriteValue") == 0) {
            GVariant *ay = NULL, *opts = NULL;
            g_variant_get(params, "(@ay@a{sv})", &ay, &opts);
            if (opts) g_variant_unref(opts);
            gsize n = 0;
            const guint8 *data = g_variant_get_fixed_array(ay, &n, sizeof(guint8));
            g_print("[RX] %zu bytes: %.*s\n", n, (int)n, (const char *)data);
            /* Milestone 1: echo straight back out on TX. */
            tx_notify(data, n);
            g_variant_unref(ay);
            g_dbus_method_invocation_return_value(invocation, NULL);
            return;
        }
        if (g_strcmp0(method, "ReadValue") == 0) {
            g_dbus_method_invocation_return_value(
                invocation, g_variant_new("(@ay)", bytes_to_ay(NULL, 0)));
            return;
        }
        if (g_strcmp0(method, "StartNotify") == 0) {
            tx_notifying = TRUE;
            g_print("[TX] central subscribed — link ready\n");
            g_dbus_method_invocation_return_value(invocation, NULL);
            return;
        }
        if (g_strcmp0(method, "StopNotify") == 0) {
            tx_notifying = FALSE;
            g_print("[TX] central unsubscribed\n");
            g_dbus_method_invocation_return_value(invocation, NULL);
            return;
        }
    }

    /* Advertisement release. */
    if (g_strcmp0(iface, ADV_IFACE) == 0 && g_strcmp0(method, "Release") == 0) {
        g_print("[ADV] released by BlueZ\n");
        g_dbus_method_invocation_return_value(invocation, NULL);
        return;
    }

    g_dbus_method_invocation_return_error(invocation, G_DBUS_ERROR,
                                          G_DBUS_ERROR_UNKNOWN_METHOD,
                                          "Unhandled %s.%s", iface, method);
}

static const GDBusInterfaceVTable iface_vtable = {
    .method_call  = method_call,
    .get_property = get_property,
    .set_property = NULL,
};

/* -------------------------------------------------------------------------- */
/* Kernel mgmt-API advertising fallback                                        */
/*                                                                             */
/* On this Raspberry Pi OS image (kernel 6.18 / BlueZ 5.82) the kernel rejects */
/* bluetoothd's Add Extended Advertising Data (0x0055) with Invalid Parameters */
/* — instantly, before any HCI traffic — while the LEGACY Add Advertising      */
/* (0x003e, what `btmgmt add-adv` uses) works fine (verified with btmon).      */
/* So when the D-Bus LEAdvertisingManager1 path fails, we register the         */
/* advertising instance ourselves over the Bluetooth mgmt socket, exactly like */
/* btmgmt. bluetoothd keeps serving GATT; only the advertisement is ours.      */
/* Needs CAP_NET_ADMIN (run with sudo). Self-contained: no libbluetooth.       */
/* -------------------------------------------------------------------------- */
#ifndef AF_BLUETOOTH
#define AF_BLUETOOTH 31
#endif
#define BTPROTO_HCI          1
#define HCI_CHANNEL_CONTROL  3
#define HCI_DEV_NONE         0xffff

#define MGMT_OP_SET_CONNECTABLE     0x0007
#define MGMT_OP_ADD_ADVERTISING     0x003e
#define MGMT_OP_REMOVE_ADVERTISING  0x003f
#define MGMT_EV_CMD_COMPLETE        0x0001
#define MGMT_EV_CMD_STATUS          0x0002
#define MGMT_ADV_FLAG_CONNECTABLE   (1 << 0)
#define MGMT_ADV_FLAG_DISCOV        (1 << 1)

struct sockaddr_hci_compat {
    sa_family_t    hci_family;
    unsigned short hci_dev;
    unsigned short hci_channel;
};

/* NUS service UUID 6e400001-b5a3-f393-e0a9-e50e24dcca9e as a little-endian
 * 128-bit AD structure: len 0x11, type 0x07 (complete 128-bit UUID list). */
static const guint8 ADV_AD_UUID[] = {
    0x11, 0x07,
    0x9e, 0xca, 0xdc, 0x24, 0x0e, 0xe5, 0xa9, 0xe0,
    0x93, 0xf3, 0xa3, 0xb5, 0x01, 0x00, 0x40, 0x6e,
};

static int mgmt_hci_index(void)
{
    int idx = 0;
    sscanf(adapter_path, "/org/bluez/hci%d", &idx);
    return idx;
}

/* Send one mgmt command and wait (<=3 s) for its Command Complete/Status. */
static gboolean mgmt_cmd(int fd, guint16 opcode, guint16 index,
                         const guint8 *param, guint16 plen)
{
    guint8 buf[512];
    buf[0] = opcode & 0xff; buf[1] = opcode >> 8;
    buf[2] = index  & 0xff; buf[3] = index  >> 8;
    buf[4] = plen   & 0xff; buf[5] = plen   >> 8;
    if (plen) memcpy(buf + 6, param, plen);

    if (write(fd, buf, 6 + plen) != (ssize_t)(6 + plen)) {
        g_printerr("[ADV/mgmt] write failed\n");
        return FALSE;
    }

    for (;;) {
        struct pollfd pfd = { .fd = fd, .events = POLLIN };
        int pr = poll(&pfd, 1, 3000);
        if (pr <= 0) { g_printerr("[ADV/mgmt] timeout waiting for reply\n"); return FALSE; }

        guint8  ev[1024];
        ssize_t n = read(fd, ev, sizeof(ev));
        if (n < 9) continue;                      /* hdr(6) + opcode(2) + status(1) */

        guint16 ev_op   = ev[0] | (ev[1] << 8);
        guint16 cmd_op  = ev[6] | (ev[7] << 8);
        guint8  status  = ev[8];

        if (cmd_op != opcode) continue;           /* event for someone else */
        if (ev_op == MGMT_EV_CMD_COMPLETE && status == 0) return TRUE;
        if (ev_op == MGMT_EV_CMD_COMPLETE || ev_op == MGMT_EV_CMD_STATUS) {
            g_printerr("[ADV/mgmt] opcode 0x%04x failed, status 0x%02x\n", opcode, status);
            return FALSE;
        }
    }
}

/* Register the advertising instance via the legacy mgmt Add Advertising —
 * connectable + general-discoverable (kernel prepends the flags AD itself),
 * NUS UUID in the adv data, complete name in the scan response. */
static gboolean mgmt_add_advertising(void)
{
    int fd = socket(AF_BLUETOOTH, SOCK_RAW | SOCK_CLOEXEC, BTPROTO_HCI);
    if (fd < 0) { g_printerr("[ADV/mgmt] socket: need root/CAP_NET_ADMIN\n"); return FALSE; }

    struct sockaddr_hci_compat sa = {
        .hci_family  = AF_BLUETOOTH,
        .hci_dev     = HCI_DEV_NONE,
        .hci_channel = HCI_CHANNEL_CONTROL,
    };
    if (bind(fd, (struct sockaddr *)&sa, sizeof(sa)) < 0) {
        g_printerr("[ADV/mgmt] bind failed\n");
        close(fd);
        return FALSE;
    }

    guint16 index = (guint16)mgmt_hci_index();

    /* Make the adapter connectable — the per-instance connectable flag alone
     * has proven insufficient on this kernel (scan works, CONNECT_IND ignored).
     * Equivalent of `btmgmt connectable on`; does not persist across reboots,
     * hence set programmatically on every start. */
    guint8 on = 1;
    if (mgmt_cmd(fd, MGMT_OP_SET_CONNECTABLE, index, &on, 1))
        g_print("[ADV/mgmt] adapter set connectable\n");

    /* Clear any stale instance 1 from a previous run (ignore result). */
    guint8 inst = 1;
    (void)mgmt_cmd(fd, MGMT_OP_REMOVE_ADVERTISING, index, &inst, 1);

    /* Assemble add_advertising: instance(1) flags(4) duration(2) timeout(2)
     * adv_data_len(1) scan_rsp_len(1) adv_data scan_rsp                      */
    guint8  cp[256];
    guint32 flags   = MGMT_ADV_FLAG_CONNECTABLE | MGMT_ADV_FLAG_DISCOV;
    gsize   name_len = strlen(DEVICE_NAME);
    guint8  adv_len  = adv_no_uuid ? 0 : (guint8)sizeof(ADV_AD_UUID);
    guint8  srsp_len = adv_no_name ? 0 : (guint8)(2 + name_len);

    cp[0] = 1;                                    /* instance          */
    cp[1] = flags & 0xff; cp[2] = (flags >> 8) & 0xff;
    cp[3] = (flags >> 16) & 0xff; cp[4] = (flags >> 24) & 0xff;
    cp[5] = 0; cp[6] = 0;                         /* duration: default */
    cp[7] = 0; cp[8] = 0;                         /* timeout: none     */
    cp[9]  = adv_len;
    cp[10] = srsp_len;
    gsize off = 11;
    if (adv_len)  { memcpy(cp + off, ADV_AD_UUID, adv_len); off += adv_len; }
    if (srsp_len) {
        cp[off]     = (guint8)(1 + name_len);     /* AD length          */
        cp[off + 1] = 0x09;                       /* complete local name */
        memcpy(cp + off + 2, DEVICE_NAME, name_len);
        off += srsp_len;
    }

    gboolean ok = mgmt_cmd(fd, MGMT_OP_ADD_ADVERTISING, index, cp, (guint16)off);
    close(fd);
    return ok;
}

/* Kernel adv instances OUTLIVE the process (unlike D-Bus registrations, which
 * BlueZ tears down when the client disappears) — remove ours on shutdown so a
 * "ghost" SandGrain-Dev doesn't keep advertising with nothing behind it. */
static gboolean mgmt_adv_active;

static void mgmt_remove_advertising(void)
{
    int fd = socket(AF_BLUETOOTH, SOCK_RAW | SOCK_CLOEXEC, BTPROTO_HCI);
    if (fd < 0) return;
    struct sockaddr_hci_compat sa = {
        .hci_family  = AF_BLUETOOTH,
        .hci_dev     = HCI_DEV_NONE,
        .hci_channel = HCI_CHANNEL_CONTROL,
    };
    if (bind(fd, (struct sockaddr *)&sa, sizeof(sa)) == 0) {
        guint8 inst = 1;
        if (mgmt_cmd(fd, MGMT_OP_REMOVE_ADVERTISING, (guint16)mgmt_hci_index(), &inst, 1))
            g_print("[ADV/mgmt] advertising instance removed\n");
    }
    close(fd);
}

static gboolean on_shutdown_signal(gpointer u)
{
    (void)u;
    if (mgmt_adv_active) mgmt_remove_advertising();
    g_main_loop_quit(loop);
    return G_SOURCE_REMOVE;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */
static guint register_iface(const char *path, const char *iface_name)
{
    GDBusInterfaceInfo *info = g_dbus_node_info_lookup_interface(node_info, iface_name);
    GError *err = NULL;
    guint id = g_dbus_connection_register_object(conn, path, info, &iface_vtable,
                                                 NULL, NULL, &err);
    if (id == 0) {
        g_printerr("register %s (%s) failed: %s\n", path, iface_name,
                   err ? err->message : "?");
        if (err) g_error_free(err);
    }
    return id;
}

/* Read Adapter1.Powered. Returns -1 on error, else 0/1. */
static int adapter_powered(void)
{
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_sync(conn, BLUEZ_BUS_NAME, adapter_path,
                       "org.freedesktop.DBus.Properties", "Get",
                       g_variant_new("(ss)", "org.bluez.Adapter1", "Powered"),
                       G_VARIANT_TYPE("(v)"), G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);
    if (!r) {
        if (err) { g_printerr("[ADAPTER] Get Powered: %s\n", err->message); g_error_free(err); }
        return -1;
    }
    GVariant *v = NULL;
    g_variant_get(r, "(v)", &v);
    int on = g_variant_get_boolean(v) ? 1 : 0;
    g_variant_unref(v);
    g_variant_unref(r);
    return on;
}

/* Set adapter Powered = true and WAIT until the controller reports powered.
 * Powering is asynchronous in BlueZ (PowerState goes off -> off-enabling -> on);
 * registering an advertisement before it completes gets Rejected (0x0b).
 * Returns TRUE once powered. */
static gboolean power_on_adapter(void)
{
    GError *err = NULL;
    g_dbus_connection_call_sync(conn, BLUEZ_BUS_NAME, adapter_path,
                                "org.freedesktop.DBus.Properties", "Set",
                                g_variant_new("(ssv)", "org.bluez.Adapter1",
                                              "Powered", g_variant_new_boolean(TRUE)),
                                NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);
    if (err) {
        /* Busy just means a power transition is already in flight — keep polling. */
        g_printerr("[ADAPTER] Set Powered: %s (waiting for it to come up ...)\n", err->message);
        g_error_free(err);
    }

    for (int i = 0; i < 100; i++) {            /* up to ~10 s */
        int on = adapter_powered();
        if (on == 1) {
            g_print("[ADAPTER] %s powered on\n", adapter_path);
            return TRUE;
        }
        if (on < 0) return FALSE;              /* adapter missing / D-Bus error */
        g_usleep(100 * 1000);
    }
    g_printerr("[ADAPTER] still not powered after 10 s — is it rfkill-blocked?\n"
               "          try:  sudo rfkill unblock bluetooth\n");
    return FALSE;
}

static void on_register_app(GObject *src, GAsyncResult *res, gpointer u)
{
    (void)u;
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_finish(G_DBUS_CONNECTION(src), res, &err);
    if (err) {
        g_printerr("[GATT] RegisterApplication failed: %s\n", err->message);
        g_error_free(err);
        g_main_loop_quit(loop);
        return;
    }
    g_variant_unref(r);
    g_print("[GATT] application registered\n");
}

/* Advertisement registration with retry: the controller can transiently refuse
 * (still finishing power-up, or a stale instance from a previous run is being
 * torn down). Retry once a second rather than giving up. */
static void request_register_adv(void);
static int  adv_attempts;

static gboolean retry_adv_cb(gpointer u)
{
    (void)u;
    request_register_adv();
    return G_SOURCE_REMOVE;
}

static void on_register_adv(GObject *src, GAsyncResult *res, gpointer u)
{
    (void)u;
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_finish(G_DBUS_CONNECTION(src), res, &err);
    if (err) {
        adv_attempts++;
        if (adv_attempts >= 3) {
            /* bluetoothd's extended-advertising path is broken on this
             * kernel/BlueZ combo — fall back to the kernel mgmt API (the
             * btmgmt path, verified working). GATT stays with bluetoothd. */
            g_printerr("[ADV] bluetoothd path failed (%s)\n"
                       "[ADV] falling back to kernel mgmt API ...\n", err->message);
            g_error_free(err);
            if (mgmt_add_advertising()) {
                mgmt_adv_active = TRUE;
                g_print("[ADV] advertising as '%s' (kernel mgmt fallback)\n", DEVICE_NAME);
            } else {
                g_printerr("[ADV] mgmt fallback also failed. GATT is still up; you can\n"
                           "      advertise manually:\n"
                           "  sudo btmgmt add-adv -c -g "
                           "-d 11079ecadc240ee5a9e093f3a3b50100406e "
                           "-s 0e0953616e64477261696e2d446576 1\n");
            }
            return;   /* keep the main loop running either way */
        }
        g_printerr("[ADV] RegisterAdvertisement failed (%s) — retry %d/3 in 1 s\n",
                   err->message, adv_attempts);
        g_error_free(err);
        g_timeout_add(1000, retry_adv_cb, NULL);
        return;
    }
    g_variant_unref(r);
    g_print("[ADV] advertising as '%s'\n", DEVICE_NAME);
}

static void request_register_adv(void)
{
    g_dbus_connection_call(conn, BLUEZ_BUS_NAME, adapter_path,
                           "org.bluez.LEAdvertisingManager1", "RegisterAdvertisement",
                           g_variant_new("(oa{sv})", ADV_PATH, NULL),
                           NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL,
                           on_register_adv, NULL);
}

int main(void)
{
    const char *hci = g_getenv("HCI");
    static char path_buf[64];
    if (hci && *hci) {
        g_snprintf(path_buf, sizeof(path_buf), "/org/bluez/%s", hci);
        adapter_path = path_buf;
    }

    GError *err = NULL;
    conn = g_bus_get_sync(G_BUS_TYPE_SYSTEM, NULL, &err);
    if (!conn) {
        g_printerr("system bus: %s\n", err ? err->message : "?");
        return 1;
    }

    adv_no_uuid = (g_getenv("ADV_NO_UUID") != NULL);
    adv_no_name = (g_getenv("ADV_NO_NAME") != NULL);
    if (adv_no_uuid) g_print("[ADV] ServiceUUIDs omitted from advertisement (ADV_NO_UUID)\n");
    if (adv_no_name) g_print("[ADV] LocalName omitted from advertisement (ADV_NO_NAME)\n");

    char *xml = g_strdup_printf(introspection_xml_fmt,
        adv_no_name ? "" : "    <property name='LocalName' type='s' access='read'/>",
        adv_no_uuid ? "" : "    <property name='ServiceUUIDs' type='as' access='read'/>");
    node_info = g_dbus_node_info_new_for_xml(xml, &err);
    g_free(xml);
    if (!node_info) {
        g_printerr("introspection parse: %s\n", err ? err->message : "?");
        return 1;
    }

    /* Export the GATT tree + advertisement. */
    register_iface(APP_PATH,     OM_IFACE);
    register_iface(SERVICE_PATH, GATT_SVC_IFACE);
    register_iface(CHAR_TX_PATH, GATT_CHRC_IFACE);
    register_iface(CHAR_RX_PATH, GATT_CHRC_IFACE);
    register_iface(ADV_PATH,     ADV_IFACE);

    /* Wait for the controller to actually be powered before registering
     * anything — advertising on a not-yet-powered adapter gets Rejected. */
    if (!power_on_adapter()) {
        return 1;
    }

    /* Register the GATT application. */
    g_dbus_connection_call(conn, BLUEZ_BUS_NAME, adapter_path,
                           "org.bluez.GattManager1", "RegisterApplication",
                           g_variant_new("(oa{sv})", APP_PATH, NULL),
                           NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL,
                           on_register_app, NULL);

    /* Register (start) the LE advertisement — retries transient failures. */
    request_register_adv();

    g_print("nus_peripheral: adapter=%s name='%s' — Ctrl-C to stop\n",
            adapter_path, DEVICE_NAME);
    loop = g_main_loop_new(NULL, FALSE);
    g_unix_signal_add(SIGINT,  on_shutdown_signal, NULL);
    g_unix_signal_add(SIGTERM, on_shutdown_signal, NULL);
    g_main_loop_run(loop);
    return 0;
}
