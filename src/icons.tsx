import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import Download01Icon from "@hugeicons/core-free-icons/Download01Icon";
import ArrowLeft02Icon from "@hugeicons/core-free-icons/ArrowLeft02Icon";
import ArrowRight02Icon from "@hugeicons/core-free-icons/ArrowRight02Icon";
import ArrowUpRight01Icon from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import TickDouble02Icon from "@hugeicons/core-free-icons/TickDouble02Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";
import HelpCircleIcon from "@hugeicons/core-free-icons/HelpCircleIcon";
import Task01Icon from "@hugeicons/core-free-icons/Task01Icon";
import CloudAngledRainIcon from "@hugeicons/core-free-icons/CloudAngledRainIcon";
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon";
import FileSpreadsheetIcon from "@hugeicons/core-free-icons/FileSpreadsheetIcon";
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import GridViewIcon from "@hugeicons/core-free-icons/GridViewIcon";
import Leaf01Icon from "@hugeicons/core-free-icons/Leaf01Icon";
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon";
import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon";
import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";
import Package01Icon from "@hugeicons/core-free-icons/Package01Icon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import Call02Icon from "@hugeicons/core-free-icons/Call02Icon";
import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import Settings05Icon from "@hugeicons/core-free-icons/Settings05Icon";
import Plant01Icon from "@hugeicons/core-free-icons/Plant01Icon";
import Sun03Icon from "@hugeicons/core-free-icons/Sun03Icon";
import SunriseIcon from "@hugeicons/core-free-icons/SunriseIcon";
import TractorIcon from "@hugeicons/core-free-icons/TractorIcon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import UserGroupIcon from "@hugeicons/core-free-icons/UserGroupIcon";
import WifiOff01Icon from "@hugeicons/core-free-icons/WifiOff01Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import OrganicFoodIcon from "@hugeicons/core-free-icons/OrganicFoodIcon";
import Plant02Icon from "@hugeicons/core-free-icons/Plant02Icon";
import SidebarLeft01Icon from "@hugeicons/core-free-icons/SidebarLeft01Icon";
import BatteryFullIcon from "@hugeicons/core-free-icons/BatteryFullIcon";
import CellularNetworkIcon from "@hugeicons/core-free-icons/CellularNetworkIcon";
import CloudIcon from "@hugeicons/core-free-icons/CloudIcon";
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon";
import SunCloud02Icon from "@hugeicons/core-free-icons/SunCloud02Icon";
import SnowIcon from "@hugeicons/core-free-icons/SnowIcon";
import CloudAngledRainZapIcon from "@hugeicons/core-free-icons/CloudAngledRainZapIcon";
import Location01Icon from "@hugeicons/core-free-icons/Location01Icon";
import RefreshIcon from "@hugeicons/core-free-icons/RefreshIcon";

type IconProps = { size?: number; strokeWidth?: number; className?: string };

// One icon family and one default weight across navigation, controls and status.
function createIcon(icon: IconSvgElement) {
  return function Icon({
    size = 20,
    strokeWidth = 1.75,
    className,
  }: IconProps) {
    return (
      <HugeiconsIcon
        icon={icon}
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        aria-hidden="true"
        focusable="false"
      />
    );
  };
}

export const ArrowDownToLine = createIcon(Download01Icon);
export const ArrowLeft = createIcon(ArrowLeft02Icon);
export const ArrowRight = createIcon(ArrowRight02Icon);
export const ArrowUpRight = createIcon(ArrowUpRight01Icon);
export const Check = createIcon(Tick02Icon);
export const CheckCheck = createIcon(TickDouble02Icon);
export const ChevronRight = createIcon(ArrowRight01Icon);
export const ChevronDown = createIcon(ArrowDown01Icon);
export const CircleHelp = createIcon(HelpCircleIcon);
export const ClipboardList = createIcon(Task01Icon);
export const CloudRain = createIcon(CloudAngledRainIcon);
export const Copy = createIcon(Copy01Icon);
export const FileSpreadsheet = createIcon(FileSpreadsheetIcon);
export const History = createIcon(Clock01Icon);
export const LayoutGrid = createIcon(GridViewIcon);
export const Leaf = createIcon(Leaf01Icon);
export const Menu = createIcon(Menu01Icon);
export const MessageSquare = createIcon(BubbleChatIcon);
export const MoreHorizontal = createIcon(MoreHorizontalIcon);
export const Package = createIcon(Package01Icon);
export const Pencil = createIcon(PencilEdit01Icon);
export const Phone = createIcon(Call02Icon);
export const Plus = createIcon(Add01Icon);
export const Search = createIcon(Search01Icon);
export const Settings2 = createIcon(Settings05Icon);
export const Sprout = createIcon(Plant01Icon);
export const Sun = createIcon(Sun03Icon);
export const Sunrise = createIcon(SunriseIcon);
export const Tractor = createIcon(TractorIcon);
export const Trash2 = createIcon(Delete02Icon);
export const Users = createIcon(UserGroupIcon);
export const WifiOff = createIcon(WifiOff01Icon);
export const X = createIcon(Cancel01Icon);
export const Crop = createIcon(OrganicFoodIcon);
export const FieldPlant = createIcon(Plant02Icon);
export const SidebarToggle = createIcon(SidebarLeft01Icon);

export const BatteryFull = createIcon(BatteryFullIcon);
export const CellularNetwork = createIcon(CellularNetworkIcon);
export const Cloud = createIcon(CloudIcon);
export const Moon = createIcon(Moon02Icon);
export const PartlyCloudy = createIcon(SunCloud02Icon);
export const Snow = createIcon(SnowIcon);
export const Storm = createIcon(CloudAngledRainZapIcon);
export const Location = createIcon(Location01Icon);
export const Refresh = createIcon(RefreshIcon);
