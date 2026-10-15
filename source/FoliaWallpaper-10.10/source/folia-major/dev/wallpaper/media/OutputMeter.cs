using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// dev/wallpaper/media/OutputMeter.cs — read peak levels on all active output devices; no PCM or microphone access.
namespace FoliaWallpaper {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator { }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDeviceEnumerator {
        [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
    }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDeviceCollection {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IDevice {
        [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object value);
    }
    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMeter {
        [PreserveSig] int GetPeakValue(out float peak);
    }
    public sealed class OutputMeter : IDisposable {
        private readonly List<IMeter> meters = new List<IMeter>();
        public int DeviceCount { get { return meters.Count; } }
        public void Refresh() {
            Dispose();
            IDeviceEnumerator enumerator = null;
            IDeviceCollection collection = null;
            try {
                enumerator = (IDeviceEnumerator)new DeviceEnumerator();
                Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(0, 1, out collection));
                uint count;
                Marshal.ThrowExceptionForHR(collection.GetCount(out count));
                for (uint index = 0; index < Math.Min(count, 64); index++) {
                    IDevice device = null;
                    object value = null;
                    try {
                        Marshal.ThrowExceptionForHR(collection.Item(index, out device));
                        Guid iid = typeof(IMeter).GUID;
                        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out value));
                        meters.Add((IMeter)value);
                        value = null;
                    } catch { /* One disconnected device must not stop the other outputs. */ }
                    finally { Release(value); Release(device); }
                }
            } finally { Release(collection); Release(enumerator); }
        }
        public float Read() {
            float maximum = 0;
            foreach (IMeter meter in meters) {
                float peak;
                if (meter.GetPeakValue(out peak) >= 0 && !float.IsNaN(peak)) maximum = Math.Max(maximum, peak);
            }
            return Math.Min(1, maximum);
        }
        static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
        public void Dispose() { foreach (IMeter meter in meters) Release(meter); meters.Clear(); }
    }
}
