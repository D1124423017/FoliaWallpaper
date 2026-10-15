using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// dev/wallpaper/input/FoliaDesktopWheel.cs — relay only wheel deltas over an active desktop menu; no input recording.
internal static class FoliaDesktopWheel {
    private sealed class Region {
        public int x, y, width, height;
        public long expires;
        public bool Contains(int px, int py, long now, bool modified) {
            return !modified && now < expires && width > 0 && width <= 2000 && height > 0 && height <= 8640
                && px >= x && px < x + width && py >= y && py < y + height;
        }
    }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] private struct MouseData { public Point pt; public uint mouseData, flags, time; public UIntPtr extraInfo; }
    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string name);
    private static readonly HookProc callback = OnMouse;
    private static readonly ConcurrentQueue<string> output = new ConcurrentQueue<string>();
    private static Region region;
    private static IntPtr hook;
    private static volatile bool ended;
    private static int received, outside, covered, modifiedCount, accepted;
    private static long Now { get { return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond; } }

    private static bool DesktopAt(Point point) {
        IntPtr window = WindowFromPoint(point);
        if (window == IntPtr.Zero) return false;
        StringBuilder name = new StringBuilder(128);
        GetClassName(GetAncestor(window, 2), name, name.Capacity);
        if (name.ToString() == "Progman" || name.ToString() == "WorkerW") return true;
        uint pid; GetWindowThreadProcessId(window, out pid);
        try { string process = Process.GetProcessById((int)pid).ProcessName;
            return process == "webwallpaper64" || process == "webwallpaper32";
        } catch { return false; }
    }
    private static IntPtr OnMouse(int code, IntPtr message, IntPtr data) {
        // Ignore moves/clicks without decoding them. Never suppress or change Windows input.
        if (code >= 0 && message.ToInt64() == 0x020A) {
            received++;
            Region current = Volatile.Read(ref region);
            if (current != null) {
                MouseData wheel = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
                bool modified = (GetAsyncKeyState(0x11) & 0x8000) != 0 || (GetAsyncKeyState(0x12) & 0x8000) != 0
                    || (GetAsyncKeyState(0x10) & 0x8000) != 0;
                if (modified) modifiedCount++;
                else if (!current.Contains(wheel.pt.x, wheel.pt.y, Now, false)) outside++;
                else if (!DesktopAt(wheel.pt)) covered++;
                else if (output.Count < 32) {
                    short delta = unchecked((short)(wheel.mouseData >> 16));
                    if (delta != 0) { accepted++; output.Enqueue("{\"x\":" + wheel.pt.x + ",\"y\":" + wheel.pt.y + ",\"delta\":" + delta + "}"); }
                }
            }
        }
        return CallNextHookEx(hook, code, message, data);
    }
    [STAThread] private static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "--self-test") {
            Region test = new Region { x = 100, y = 200, width = 380, height = 700, expires = 5000 };
            if (!test.Contains(110, 210, 1000, false) || test.Contains(99, 210, 1000, false)
                || test.Contains(480, 210, 1000, false) || test.Contains(110, 210, 5000, false)
                || test.Contains(110, 210, 1000, true)) return 1;
            test.width = 2001; if (test.Contains(110, 210, 1000, false)) return 1;
            Console.WriteLine("Wheel scope, expiry and modifier checks passed; no hook installed."); return 0;
        }
        Console.OutputEncoding = new UTF8Encoding(false);
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { }
        // Report actual physical display geometry once, not any pointer or window history.
        var displays = new System.Collections.Generic.List<object>();
        foreach (Screen display in Screen.AllScreens) {
            var bounds = display.Bounds;
            displays.Add(new { x = bounds.X, y = bounds.Y, width = bounds.Width, height = bounds.Height });
        }
        Console.WriteLine(new JavaScriptSerializer().Serialize(new { screens = displays }));
        Task.Run(() => {
            JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 4096 };
            try { string line; while ((line = Console.ReadLine()) != null) {
                if (line.Length > 4096) continue;
                Region next = json.Deserialize<Region>(line);
                if (next == null || next.width < 0 || next.width > 2000 || next.height < 0 || next.height > 8640) continue;
                next.expires = Now + 1500; Volatile.Write(ref region, next);
            } } catch { } finally { ended = true; }
        });
        System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 40 };
        long nextStatus = 0;
        timer.Tick += (sender, eventArgs) => {
            Region current = Volatile.Read(ref region);
            bool active = !ended && current != null && current.width > 0 && current.height > 0 && Now < current.expires;
            if (active && hook == IntPtr.Zero) {
                hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0);
                if (hook == IntPtr.Zero) { Console.Error.WriteLine("Wheel hook could not start: " + Marshal.GetLastWin32Error()); ended = true; }
                else Console.WriteLine("{\"ready\":true}");
            } else if (!active && hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
            string value; while (output.TryDequeue(out value)) Console.WriteLine(value);
            if (active && Now >= nextStatus) {
                nextStatus = Now + 1000;
                Console.WriteLine(new JavaScriptSerializer().Serialize(new { counters = new { received, outside, covered, modified = modifiedCount, accepted } }));
            }
            if (ended) Application.ExitThread();
        };
        timer.Start();
        try { Application.Run(); } finally { timer.Dispose(); if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook); }
        return 0;
    }
}
